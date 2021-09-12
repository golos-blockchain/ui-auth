const koa_router = require('koa-router');
const koa_body = require('koa-body');
const config = require('config');
const Tarantool = require('../../db/tarantool');
const { checkCSRF, getRemoteIp, rateLimitReq, returnError } = require('../utils/misc');
const { hash } = require('golos-classic-js/lib/auth/ecc');
const { api } = require('golos-classic-js');
const secureRandom = require('secure-random');
const gmailSend = require('gmail-send');
const passport = require('koa-passport');
const VKontakteStrategy = require('passport-vk').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const MailruStrategy = require('passport-mail').Strategy;
const YandexStrategy = require('passport-yandex').Strategy;

function digits(text) {
    const digitArray = text.match(/\d+/g);
    return digitArray ? digitArray.join('') : '';
}

/**
 * return status types:
 * session - new user without identity in DB
 * waiting - user verification email in progress
 * done - user verification email is successfuly done
 * already_used -
 * attempts_10 - Confirmation was attempted a moment ago. You can try again only in 10 seconds
 * attempts_300 - Confirmation was attempted a moment ago. You can try again only in 5 minutes
 * @param {*} app
 */
module.exports = function useRegistrationApi(app) {
    app.use(passport.initialize());
    app.use(passport.session());

    passport.serializeUser(function(user, done) {
        done(null, user);
    });
    passport.deserializeUser(function(user, done) {
        done(null, user);
    });

    const router = koa_router({ prefix: '/api/reg' });
    app.use(router.routes());
    const koaBody = koa_body();

    const strategies = {
        vk: VKontakteStrategy, facebook: FacebookStrategy,
        mailru: MailruStrategy, yandex: YandexStrategy
    };
    for (const [grantId, grant] of Object.entries(config.grant)) {
        const strategy = strategies[grantId];
        if (!strategy || !grant.enabled) continue;
        try {
            passport.use(new strategy(
                {
                    clientID: grant.key,
                    clientSecret: grant.secret,
                    callbackURL: `${config.REST_API}/api/reg/modal/${grantId}/callback`,
                    passReqToCallback: true
                },
                async (req, accessToken, refreshToken, params, profile, done) => {
                    console.log(req)
                    req.session.soc_id = profile.id;
                    req.session.soc_id_type = grantId + '_id';

                    const idHash = hash.sha256(req.session.soc_id.toString(), 'hex');

                    console.log('-- social select user');

                    let user = await Tarantool.instance('tarantool').select('users', 'by_verify_uid',
                        1, 0, 'eq', ['social-' + grantId, idHash, req.session.uid]);

                    if (!user[0]) {
                        console.log('-- social insert user');
                        user = await Tarantool.instance('tarantool').insert('users',
                            [null, req.session.uid, 'social-' + grantId, idHash, true, '1234', getRemoteIp(req), false]);
                    }

                    req.session.user = user[0][0];

                    done(null, {profile});
                }
            ));
        } catch (ex) {
            console.error(`ERROR: Wrong config.grant.${grantId} settings. Fix them or just disable registration with ${grantId}. Error is following:`)
            throw ex;
        }
    }

    router.get('/get_uid/:client?', koaBody, async (ctx) => {
        const last_visit = ctx.session.last_visit;
        ctx.session.last_visit = new Date().getTime() / 1000 | 0;
        if (!ctx.session.uid) {
            ctx.session.uid = secureRandom.randomBuffer(13).toString('hex');
            ctx.session.new_visit = true;
        } else {
            ctx.session.new_visit = ctx.session.last_visit - last_visit > 1800;
        }

        let cfg = {};

        cfg.captcha = {};
        let captcha = config.get('captcha');
        if (captcha) {
            let recaptcha_v2 = captcha.get('recaptcha_v2');
            if (recaptcha_v2) {
                cfg.captcha['recaptcha_v2'] = {};
                cfg.captcha['recaptcha_v2'].enabled = recaptcha_v2.get('enabled');
                if (recaptcha_v2.get('enabled')) {
                    cfg.captcha['recaptcha_v2'].site_key = recaptcha_v2.get('site_key');

                    if (!cfg.captcha['recaptcha_v2'].site_key) {
                        console.error('Captcha ERROR: recaptcha_v2 has wrong site_key in config!');
                    }
                } else {
                    console.error('Captcha ERROR: recaptcha_v2 is disabled in config!');
                }
            } else {
                console.error('Captcha ERROR: recaptcha_v2 is absent in config!');
            }
        } else {
            console.error('Captcha ERROR: captcha is absent in config!');
        }

        cfg.client = {};
        let client = config.get('default_client');
        if (ctx.params.client) {
            if (config.get('clients').has(ctx.params.client)) {
                client = ctx.params.client;
            } else {
                console.error('Cannot get config for client ' + ctx.params.client);
            }
        }
        const clientParams = config.get('clients').get(client);
        cfg.client.id = client;
        cfg.client.locale =
            clientParams.has('default_locale') ?
            clientParams.get('default_locale') : 'ru';
        cfg.client = {...cfg.client, ...clientParams};

        cfg.grants = {};
        const grant = config.get('grant') || {};
        for (const [key, val] of Object.entries(grant)) {
            cfg.grants[key] = {
                enabled: val.enabled,
            };
        }

        ctx.body = {
            status: 'ok',
            config: cfg,
        }
    });

    router.post('/verify_code', koaBody, async (ctx) => {
        if (rateLimitReq(ctx, ctx.req, 10)) return;

        if (!ctx.request.body) {
            ctx.status = 400;
            ctx.body = 'Bad Request';
            return;
        }

        const body = ctx.request.body;
        let params = {};

        let error = false

        if (typeof body === 'string') {
            try {
                params = JSON.parse(body);
            } catch (e) {}
        } else {
            params = body;
        }

        const { confirmation_code, email } = params;

        console.log(
            '-- /api/verify_code -->',
            email,
            confirmation_code
        );

        const emailHash = hash.sha256(email, 'hex');

        const user = await Tarantool.instance('tarantool').select('users', 'by_verify_uid',
            1, 0, 'eq', ['email', emailHash, ctx.session.uid, false]);

        if (!user[0]) {
            ctx.status = 401;
            ctx.body = 'No confirmation for this e-mail';
            return;
        }

        if (user[0][5] != confirmation_code) {
            ctx.status = 401;
            ctx.body = 'Wrong confirmation code';
            return;
        }

        await Tarantool.instance('tarantool').update('users', 'primary', [user[0][0]], [['=', 4, true]])

        ctx.session.user = user[0][0];

        ctx.body =
            'GOLOS.id \nСпасибо за подтверждение вашей почты';
    });

    router.post('/send_code', koaBody, async (ctx) => {
        if (rateLimitReq(ctx, ctx.req)) return;

        if (!config.gmail_send.user || !config.gmail_send.pass) {
          ctx.status = 401;
          ctx.body = 'Mail service disabled';
          return;
        }

        const body = ctx.request.body;
        let params = {};

        if (typeof body === 'string') {
            try {
                params = JSON.parse(body);
            } catch (e) {}
        } else {
            params = body;
        }

        const { email } = params;

        //const retry = params.retry ? params.retry : null;

        if (!email || !/^[a-z0-9](\.?[a-z0-9]){5,}@g(oogle)?mail\.com$/.test(email)) {
            ctx.body = JSON.stringify({ status: 'provide_email' });
            return;
        }

        const emailHash = hash.sha256(email, 'hex');

        console.log('/send_code existing_email');

        const existing_email = await Tarantool.instance('tarantool').select('users', 'by_verify_registered',
            1, 0, 'eq', ['email', emailHash, true]);
        if (existing_email[0]) {
            console.log('-- /send_code existing_email error -->',
                ctx.session.user, ctx.session.uid,
                emailHash, existing_email[0][0]
            );
            ctx.body = JSON.stringify({ status: 'already_used' });
            return;
        }

        let confirmation_code = parseInt(
            secureRandom.randomBuffer(8).toString('hex'),
            16
        ).toString(10).substring(0, 4); // 4 digit code

        console.log('-- /send_code select user');

        let user = await Tarantool.instance('tarantool').select('users', 'by_verify_uid',
            1, 0, 'le', ['email', emailHash, ctx.session.uid, true]);

        // TODO возможно сделать срок активности для кодов
        //const seconds_ago = (Date.now() - mid.updated_at) / 1000.0;
        //const timeAgo = process.env.NODE_ENV === 'production' ? 300 : 10;

        //if (retry) {
        //    confirmation_code = mid.confirmation_code;
        //} else {
        //    if (seconds_ago < timeAgo) {
        //        ctx.body = JSON.stringify({ status: 'attempts_300' });
        //        return;
        //    }
        //    await mid.update({ confirmation_code, email: emailHash });
        //}

        if (user[0] && user[0][2] === 'email' && user[0][3] === emailHash && user[0][1] === ctx.session.uid) {
            if (user[0][4]) {
                ctx.body = JSON.stringify({
                    status: 'done',
                });
                ctx.session.user = user[0][0];
                return;
            }
        } else {
            user[0] = null;
        }

        // Send mail
        const send = gmailSend({
            user: config.gmail_send.user,
            pass: config.gmail_send.pass,
            from: 'registrator@golos.id',
            to: email,
            subject: 'Golos verification code',
        });

        try {
            await send({
                html: `Registration code: <h4>${confirmation_code}</h4>`,
            });
        } catch (e) {
            console.log(e);

            ctx.body = JSON.stringify({
                status: 'error',
                error: 'Send code error ' + e,
            });

            return;
        }

        const ip = getRemoteIp(ctx.request.req);

        if (!user[0]) {
            console.log('-- /send_code insert user');
            user = await Tarantool.instance('tarantool').insert('users',
                [null, ctx.session.uid, 'email', emailHash, false,
                confirmation_code, ip, false]);
        } else {
            console.log('-- /send_code update user');
            user = await Tarantool.instance('tarantool').update('users',
                'primary', [user[0][0]],
                [['=', 5, confirmation_code], ['=', 6, ip]])
        }

        ctx.body = JSON.stringify({
            status: 'waiting',
        });
    });

    router.post('/use_invite', koaBody, async (ctx) => {
        if (rateLimitReq(ctx, ctx.req)) return;

        const body = ctx.request.body;
        let params = {};
        let error = false

        if (typeof body === 'string') {
            try {
                params = JSON.parse(body);
            } catch (e) {}
        } else {
            params = body;
        }

        const { invite_key } = params

        //const retry = params.retry ? params.retry : null;

        if (!invite_key) {
            ctx.body = JSON.stringify({ status: 'provide_email' });
            return;
        }

        let invite = null;
        try {
            invite = await api.getInviteAsync(invite_key);
        } catch (err) {
            if (err.message.includes('Invalid value')) {
                ctx.body = JSON.stringify({ status: 'no_invite' });
            } else {
                ctx.body = JSON.stringify({ status: 'blockchain_not_available' });
            }
            return;
        }
        if (!invite) {
            ctx.body = JSON.stringify({ status: 'no_invite' });
            return;
        }

        console.log('-- /use_invite select user');

        const inviteHash = hash.sha256(invite_key, 'hex');

        let user = await Tarantool.instance('tarantool').select('users', 'by_verify_uid',
            1, 0, 'eq', ['invite_code', inviteHash, ctx.session.uid]);

        if (!user[0]) {
            console.log('-- /use_invite insert user');
            user = await Tarantool.instance('tarantool').insert('users',
                [null, ctx.session.uid, 'invite_code', inviteHash, true, '1234', getRemoteIp(ctx.request.req), false]);
        }

        ctx.session.user = user[0][0];

        ctx.body = JSON.stringify({
            status: 'done',
        });
    });

    router.get('/modal/vk', (ctx, next) => {
        passport.authenticate('vkontakte')(ctx, next);
    });
    router.get('/modal/vk/callback', passport.authenticate('vkontakte', {
        successRedirect: '/api/reg/modal/success',
        failureRedirect: '/api/reg/modal/failure'
    }));

    router.get('/modal/facebook', passport.authenticate('facebook'));
    router.get('/modal/facebook/callback', passport.authenticate('facebook', {
        successRedirect: '/api/reg/modal/success',
        failureRedirect: '/api/reg/modal/failure'
    }));

    router.get('/modal/mailru', passport.authenticate('mailru'));
    router.get('/modal/mailru/callback', passport.authenticate('mailru', {
        successRedirect: '/api/reg/modal/success',
        failureRedirect: '/api/reg/modal/failure'
    }));

    router.get('/modal/yandex', passport.authenticate('yandex'));
    router.get('/modal/yandex/callback', passport.authenticate('yandex', {
        successRedirect: '/api/reg/modal/success',
        failureRedirect: '/api/reg/modal/failure'
    }));

    router.get('/modal/failure', (ctx) => {
        ctx.status = 200;
        ctx.statusText = 'OK';
        ctx.body = {
            status: 'cannot_authorize',
            statusText: 'Cannot register - cannot authorize with social network.'
        };
    });

    router.get('/modal/success', (ctx) => {
        ctx.status = 200;
        ctx.statusText = 'OK';
        ctx.body = '<script>window.close();</script>';
    });

    router.get('/check_soc_auth', (ctx) => {
        ctx.body = {
            soc_id_type: ctx.session.soc_id_type || null,
        };
    });
}
