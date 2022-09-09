import config from 'config';
import gmailSend from 'gmail-send';
import golos from 'golos-lib-js';
import { hash, } from 'golos-lib-js/lib/auth/ecc';
import secureRandom from 'secure-random';
import nextConnect from '@/server/nextConnect';
import { throwErr, } from '@/server/error';
import { initGolos, } from '@/server/initGolos';
import { getVersion, rateLimitReq, getRemoteIp,
        noBodyParser, bodyParams, } from '@/server/misc';
import passport, { addModalRoutes, checkAlreadyUsed } from '@/server/passport';
import { getDailyLimit, obtainUid, getClientCfg, } from '@/server/reg';
import { regSessionMiddleware, } from '@/server/regSession';
import Tarantool from '@/server/tarantool';

initGolos();

let handler = nextConnect({ attachParams: true, })
    .use(regSessionMiddleware)
    .use(passport.initialize())
    .use(passport.session())

    .get('/api/reg/get_uid', async (req, res) => {
        obtainUid(req);
        await req.session.save();
        res.json({
            status: 'ok',
            version: getVersion(),
            free_limit: getDailyLimit()
        })
    })

    .get('/api/reg/set_locale/:locale', async (req, res) => {
        const { locale, } = req.params;
        if (locale !== 'ru' && locale !== 'en') {
            throwErr(req, 400, ['Locale must be ru or en']);
        }
        let localeWasAlreadySet = false;
        if (req.session.locale === locale)
            localeWasAlreadySet = true;
        req.session.locale = locale;
        await req.session.save();
        res.json({
            status: 'ok',
            locale_was_already_set: localeWasAlreadySet,
        });
    })

    .get('/api/reg/get_client/:client?', async (req, res) => {
        const { locale, } = req.query;
        if (locale && locale !== 'ru' && locale !== 'en') {
            throwErr(req, 400, ['Locale must be ru or en']);
        }
        let cfg = getClientCfg(req, req.params, locale);
        res.json({
            status: 'ok',
            version: cfg.version,
            ...cfg,
        });
    })

    .post('/api/reg/send_code', async (req, res) => {
        let state = {
            verification_way: 'email',
            step: 'sending',
        };

        rateLimitReq(req, state);

        if (!config.gmail_send.user || !config.gmail_send.pass) {
            throwErr(req, 503, ['registration_with_email_disabled'], null, state);
        }

        let params = await bodyParams(req, false);

        const { email } = params;

        //const retry = params.retry ? params.retry : null;

        if (!email) {
            throwErr(req, 400, ['no_email_parameter'], null, state);
        }
        const fakeEmailsAllowed = config.has('fake_emails_allowed')
            && config.get('fake_emails_allowed');
        if (fakeEmailsAllowed && !/^[a-z0-9](\.?[a-z0-9]){5,}@g(oogle)?mail\.com$/.test(email)) {
            throwErr(req, 400, ['wrong_mail_service'], null, state)
        }

        if (email.split('@')[0].includes('.')) {
            throwErr(req, 400, ['google_aliases_not_supported'], null, state)
        }

        const emailHash = hash.sha256(email, 'hex');

        console.log('/send_code existing_email');

        await checkAlreadyUsed(req, 'email', emailHash, state)

        let confirmation_code = parseInt(
            secureRandom.randomBuffer(8).toString('hex'),
            16
        ).toString(10).substring(0, 4); // 4 digit code

        console.log('-- /send_code select user');

        let user = await Tarantool.instance('tarantool').select('users', 'by_verify_uid',
            1, 0, 'le', ['email', emailHash, req.session.uid, true]);

        // TODO возможно сделать срок активности для кодов
        //const seconds_ago = (Date.now() - mid.updated_at) / 1000.0;
        //const timeAgo = process.env.NODE_ENV === 'production' ? 300 : 10;

        //if (retry) {
        //    confirmation_code = mid.confirmation_code;
        //} else {
        //    if (seconds_ago < timeAgo) {
        //        res.json({ status: 'attempts_300' });
        //        return;
        //    }
        //    await mid.update({ confirmation_code, email: emailHash });
        //}

        if (user[0] && user[0][2] === 'email' && user[0][3] === emailHash && user[0][1] === req.session.uid) {
            if (user[0][4]) {
                req.session.user = user[0][0];
                await req.session.save();

                state.step = 'verified';
                res.json({
                    status: 'ok',
                    already_verified: true,
                    ...state,
                });
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
            throwErr(req, 500, ['cannot_send_email'], null, state);
        }

        const ip = getRemoteIp(req);

        if (!user[0]) {
            console.log('-- /send_code insert user');
            user = await Tarantool.instance('tarantool').insert('users',
                [null, req.session.uid, 'email', emailHash, false,
                confirmation_code, ip, false]);
        } else {
            console.log('-- /send_code update user');
            user = await Tarantool.instance('tarantool').update('users',
                'primary', [user[0][0]],
                [['=', 5, confirmation_code], ['=', 6, ip]])
        }

        state.step = 'sent';
        state.status = 'ok';
        res.json({
            status: 'ok',
            already_verified: false,
            ...state,
        });
    })

    .post('/api/reg/verify_code', async (req, res) => {
        let state = {
            verification_way: 'email',
            step: 'sent',
        };

        rateLimitReq(req, state, 10);

        let params = {};

        let error = false

        params = await bodyParams(req, false);

        const { confirmation_code, email, } = params;

        console.log(
            '-- /api/verify_code -->',
            email,
            confirmation_code
        );

        const emailHash = hash.sha256(email, 'hex');

        const user = await Tarantool.instance('tarantool').select('users', 'by_verify_uid',
            1, 0, 'eq', ['email', emailHash, req.session.uid, false]);

        if (!user[0]) {
            throwErr(req, 400, ['no_confirmation_for_this_email'], null, state);
        }

        if (user[0][5] != confirmation_code) {
            throwErr(req, 400, ['wrong_confirmation'], null, state);
        }

        await Tarantool.instance('tarantool').update('users', 'primary', [user[0][0]], [['=', 4, true]])

        req.session.user = user[0][0];
        await req.session.save();

        state.step = 'verified';
        state.status = 'ok';
        res.json({
            ...state,
        });
    })

    .get('/api/reg/check_soc_auth', async (req, res) => {
        const { soc_id, soc_id_type, soc_error, } = req.session
        let state = {
            verification_way: 'social-undefined',
            step: (soc_id_type && !soc_error) ? 'verified' : 'sending',
        }
        if (!soc_id) {
            delete req.session.soc_error // To do not prevent another tries
            await req.session.save()
            throwErr(req, soc_error.status, [soc_error.message], soc_error.exception, state)
        }
        state.status = 'ok'
        res.json({
            soc_id_type: soc_id_type || null,
            ...state,
        })
    })

    .post('/api/reg/use_invite', async (req, res) => {
        let state = {
            verification_way: 'invite_code',
            step: 'sending',
        };

        rateLimitReq(req, state);

        let params = {};
        let error = false

        params = await bodyParams(req, false);

        const { invite_key } = params

        //const retry = params.retry ? params.retry : null;

        if (!invite_key) {
            throwErr(req, 400, ['no_invite_key_parameter'], null, state);
        }

        let invite = null;
        try {
            invite = await golos.api.getInviteAsync(invite_key);
        } catch (err) {
            if (err.message.includes('Invalid value')) {
                throwErr(req, 400, ['no_such_invite'], null, state);
            } else {
                console.error(`/use_invite ${invite_key}`, err);
                throwErr(req, 503, ['blockchain_not_available_for_invite'], null, state);
            }
            return;
        }
        if (!invite) {
            throwErr(req, 400, ['no_such_invite'], null, state);
        }

        console.log('-- /use_invite select user');

        const inviteHash = hash.sha256(invite_key, 'hex');

        let user = await Tarantool.instance('tarantool').select('users', 'by_verify_uid',
            1, 0, 'eq', ['invite_code', inviteHash, req.session.uid]);

        if (!user[0]) {
            console.log('-- /use_invite insert user');
            user = await Tarantool.instance('tarantool').insert('users',
                [null, req.session.uid, 'invite_code', inviteHash, true, '1234', getRemoteIp(req), false]);
        }

        req.session.user = user[0][0];
        await req.session.save();

        state.step = 'verified';
        state.status = 'ok';
        res.json({
            ...state,
        });
    })

handler = addModalRoutes(handler);

export default handler;

export {
    noBodyParser as config,
};
