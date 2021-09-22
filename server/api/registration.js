const koa_router = require('koa-router');
const koa_body = require('koa-body');
const config = require('config');
const Tarantool = require('../../db/tarantool');
const { checkCSRF, getRemoteIp, rateLimitReq, throwErr, } = require('../utils/misc');
const { hash } = require('golos-lib-js/lib/auth/ecc');
const { api } = require('golos-lib-js');
const secureRandom = require('secure-random');
const gmailSend = require('gmail-send');
const git = require('git-rev-sync');
const passport = require('koa-passport');
const VKontakteStrategy = require('passport-vk').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const MailruStrategy = require('passport-mail').Strategy;
const YandexStrategy = require('passport-yandex').Strategy;

function digits(text) {
    const digitArray = text.match(/\d+/g);
    return digitArray ? digitArray.join('') : '';
}

module.exports = function useRegistrationApi(app) {
    app.use(passport.initialize());
    app.use(passport.session());

    passport.serializeUser(function(user, done) {
        done(null, user);
    });
    passport.deserializeUser(function(user, done) {
        done(null, user);
    });

    const router = koa_router({ prefix: '/reg', });

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
                    callbackURL: `${config.rest_api}/api/reg/modal/${grantId}/callback`,
                    passReqToCallback: true
                },
                async (req, accessToken, refreshToken, params, profile, done) => {
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

    router.get('/get_uid', koaBody, async (ctx) => {
        const last_visit = ctx.session.last_visit;
        ctx.session.last_visit = new Date().getTime() / 1000 | 0;
        if (!ctx.session.uid) {
            ctx.session.uid = secureRandom.randomBuffer(13).toString('hex');
            ctx.session.new_visit = true;
        } else {
            ctx.session.new_visit = ctx.session.last_visit - last_visit > 1800;
        }

        ctx.body = {
            status: 'ok',
            version: git.short(),
        };
    });

    router.get('/get_client/:client?', koaBody, async (ctx) => {
        const { locale, } = ctx.query;
        let localeWasAlreadySet = undefined;
        if (locale) {
            if (locale !== 'ru' && locale !== 'en') {
                throwErr(ctx, 400, ['Locale must be ru or en']);
            }
            localeWasAlreadySet = false;
            if (ctx.session.locale === locale)
                localeWasAlreadySet = true;
            ctx.session.locale = locale;
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

        cfg.fake_emails_allowed = config.has('fake_emails_allowed')
            && config.get('fake_emails_allowed');

        ctx.body = {
            status: 'ok',
            version: git.short(),
            locale_was_already_set: localeWasAlreadySet,
            config: cfg,
        }
    });

    router.post('/verify_code', koaBody, async (ctx) => {
        let state = {
            verification_way: 'email',
            step: 'sent',
        };

        rateLimitReq(ctx, ctx.req, state, 10);

        if (!ctx.request.body) {
            throwErr(ctx, 400, ['request_should_have_json_body'], null, state);
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
            throwErr(ctx, 400, ['no_confirmation_for_this_email'], null, state);
        }

        if (user[0][5] != confirmation_code) {
            throwErr(ctx, 400, ['wrong_confirmation'], null, state);
        }

        await Tarantool.instance('tarantool').update('users', 'primary', [user[0][0]], [['=', 4, true]])

        ctx.session.user = user[0][0];

        state.step = 'verified';
        state.status = 'ok';
        ctx.body = {
            ...state,
        };
    });

    router.post('/send_code', koaBody, async (ctx) => {
        let state = {
            verification_way: 'email',
            step: 'sending',
        };

        rateLimitReq(ctx, ctx.req, state);

        if (!config.gmail_send.user || !config.gmail_send.pass) {
            throwErr(ctx, 503, ['registration_with_email_disabled'], null, state);
        }

        const body = ctx.request.body;
        if (!body) {
            throwErr(ctx, 400, ['request_should_have_json_body'], null, state);
        }

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

        if (!email) {
            throwErr(ctx, 400, ['no_email_parameter'], null, state);
        }
        const fakeEmailsAllowed = config.has('fake_emails_allowed')
            && config.get('fake_emails_allowed');
        if (fakeEmailsAllowed && !/^[a-z0-9](\.?[a-z0-9]){5,}@g(oogle)?mail\.com$/.test(email)) {
            throwErr(ctx, 400, ['wrong_mail_service'], null, state);
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
            throwErr(ctx, 400, ['email_already_used'], null, state);
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
                state.step = 'verified';
                ctx.body = {
                    status: 'ok',
                    already_verified: true,
                    ...state,
                };
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
            console.log('Send code to e-mail error', e);
            throwErr(ctx, 500, ['cannot_send_email'], null, state);
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

        state.step = 'sent';
        state.status = 'ok';
        ctx.body = {
            status: 'ok',
            already_verified: false,
            ...state,
        };
    });

    router.post('/use_invite', koaBody, async (ctx) => {
        let state = {
            verification_way: 'invite_code',
            step: 'sending',
        };

        rateLimitReq(ctx, ctx.req, state);

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
            throwErr(ctx, 400, ['no_invite_key_parameter'], null, state);
        }

        let invite = null;
        try {
            invite = await api.getInviteAsync(invite_key);
        } catch (err) {
            if (err.message.includes('Invalid value')) {
                throwErr(ctx, 400, ['no_such_invite'], null, state);
            } else {
                throwErr(ctx, 503, ['blockchain_not_available_for_invite'], null, state);
            }
            return;
        }
        if (!invite) {
            throwErr(ctx, 400, ['no_such_invite'], null, state);
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

        state.step = 'verified';
        state.status = 'ok';
        ctx.body = JSON.stringify({
            status: 'done',
            ...state,
        });
    });

    router.get('/modal/vk', (ctx, next) => {
        ctx.session.soc_type = 'vkontakte';
        passport.authenticate('vkontakte')(ctx, next);
    });
    router.get('/modal/vk/callback', passport.authenticate('vkontakte', {
        successRedirect: '/api/reg/modal/success',
        failureRedirect: '/api/reg/modal/failure'
    }));

    router.get('/modal/facebook', (ctx, next) => {
        ctx.session.soc_type = 'facebook';
        passport.authenticate('facebook')(ctx, next);
    });
    router.get('/modal/facebook/callback', passport.authenticate('facebook', {
        successRedirect: '/api/reg/modal/success',
        failureRedirect: '/api/reg/modal/failure'
    }));

    router.get('/modal/mailru', (ctx, next) => {
        ctx.session.soc_type = 'mailru';
        passport.authenticate('mailru')(ctx, next);
    });
    router.get('/modal/mailru/callback', passport.authenticate('mailru', {
        successRedirect: '/api/reg/modal/success',
        failureRedirect: '/api/reg/modal/failure'
    }));

    router.get('/modal/yandex', (ctx, next) => {
        ctx.session.soc_type = 'yandex';
        passport.authenticate('yandex')(ctx, next);
    });
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
        const { soc_type, soc_id_type, } = ctx.session;
        let state = {
            status: 'ok',
            verification_way: 'social-' + soc_type,
            step: soc_id_type ? 'verified' : 'sending',
        };
        ctx.body = {
            soc_id_type: soc_id_type || null,
            ...state,
        };
    });

    app.use(router.routes());
    app.use(router.allowedMethods({ throw: true, }));
}
