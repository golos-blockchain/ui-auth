const koa_router = require('koa-router');
const koa_body = require('koa-body');
const Tarantool = require('../../db/tarantool');
const config = require('config');
const {emailRegex, getRemoteIp, rateLimitReq, checkCSRF, throwErr, } = require('../utils/misc');
const {PublicKey, Signature, hash} = require('golos-classic-js/lib/auth/ecc');
const {api, broadcast} = require('golos-classic-js');
const axios = require('axios');
const querystring = require('querystring');
const coBody = require('co-body');
const session = require('../utils/cryptoSession');
const useRegistrationApi = require('./registration');

module.exports = function useGeneralApi(app) {
    const router = koa_router({prefix: '/api'});

    const crypto_key = config.get('server_session_secret');
    session(router, {
        maxAge: 1000 * 3600 * 24 * 60,
        crypto_key,
        key: config.get('session_cookie_key'),
    });

    useRegistrationApi(router);

    const koaBody = koa_body();

    router.get('/', (ctx) => {
        ctx.body = {
            status: 'ok',
            date: new Date(),
        };
    })

    router.post('/csp_violation', async (ctx) => {
        rateLimitReq(ctx, ctx.req, {});

        const params = await coBody.json(ctx);
        console.log('-- /csp_violation -->', ctx.req.headers['user-agent'], params);
        ctx.body = {};
    });

    router.get('/set_locale/:locale', koaBody, async (ctx) => {
        const { locale, } = ctx.params;
        if (locale !== 'ru' && locale !== 'en') {
            throwErr(ctx, 400, ['Locale must be ru or en']);
        }
        let localeWasAlreadySet = false;
        if (ctx.session.locale === locale)
            localeWasAlreadySet = true;
        ctx.session.locale = locale;
        ctx.body = {
            status: 'ok',
            locale_was_already_set: localeWasAlreadySet,
        };
    });

    router.post('/reg/submit', koaBody, async (ctx) => {
        let state = {
            step: 'verified',
        };

        rateLimitReq(ctx, ctx.req, state);

        const params = ctx.request.body;
        const account = typeof(params) === 'string' ? JSON.parse(params) : params;

        //if (!checkCSRF(ctx, account.csrf)) return;
        console.log('-- /submit -->', ctx.session.uid, ctx.session.user, account);

        const user_id = parseInt(ctx.session.user);
        if (isNaN(user_id)) { // require user to sign in with identity provider
            if (ctx.session.user) {
                console.log('-- /submit - user_id is NaN:', user_id, account)
            }
            throwErr(ctx, 403, ['not_verified'], null, state);
        }

        let captcha = config.get('captcha');
        if (captcha) {
            let recaptcha_v2 = captcha.get('recaptcha_v2');
            if (recaptcha_v2.get('enabled')) {
                const secret_key = recaptcha_v2.get('secret_key');

                const res = await axios.post('https://www.google.com/recaptcha/api/siteverify',
                    querystring.stringify({
                        secret: secret_key,
                        response: account.recaptcha_v2,
                    }));
                if (!res.data.success) {
                    console.error('-- /submit: try to register without ReCaptcha v2 solving, data:', res.data, ', user-id:', user_id, ', form fields:', account);
                    throwErr(ctx, 403, ['recaptcha_v2_failed'], null, state);
                }
            }
        }

        console.log('-- /submit lock_entity');

        const lock_entity_res = await Tarantool.instance('tarantool').call('lock_entity', user_id.toString());
        if (!lock_entity_res[0][0]) {
            console.log('-- /submit lock_entity -->', user_id, lock_entity_res[0][0]);
            throwErr(ctx, 400, ['name_conflict'], null, state);
        }

        console.log('-- /submit check user id');

        const user = await Tarantool.instance('tarantool').select('users', 'primary',
            1, 0, 'eq', [user_id]);
        if (!user[0]) {
            console.log('-- /submit - user_id is wrong:', user_id, account);
            throwErr(ctx, 403, ['not_verified'], null, state);
        }

        if (user[0][7]) {
            throwErr(ctx, 400, ['already_registered'], null, state);
        }

        console.log('-- /submit check same_email_account');

        if (user[0][2] === 'email') {
            const emailHash = user[0][3];
            const existing_email = await Tarantool.instance('tarantool').select('users', 'by_verify_registered',
                1, 0, 'eq', ['email', emailHash, true]);
            if (existing_email[0]) {
                console.log('-- /submit existing_email error -->',
                    ctx.session.user, ctx.session.uid,
                    emailHash, existing_email[0][0]
                );
                console.log(`api /submit: existing_same-email account ${ctx.session.uid} #${user_id}, IP ${remote_ip}`);
                throwErr(ctx, 400, ['email_already_used'], null, state);
            }
        }

        console.log('-- /submit check same_ip_account');

        const remote_ip = getRemoteIp(ctx.req);
        const same_ip_account = await Tarantool.instance('tarantool').select('accounts', 'by_remote_ip',
            1, 0, 'eq', [remote_ip]);
        if (same_ip_account[0]) {
            const seconds = (Date.now() - parseInt(same_ip_account[0][9])) / 1000;
            const minSeconds = process.env.REGISTER_INTERVAL_SEC || 10*60;
            if (seconds < minSeconds) {
                const minMinutes = Math.ceil(minSeconds / 60);
                console.log(`api /submit: IP rate limit for user ${ctx.session.uid} #${user_id}, IP ${remote_ip}`);
                throwErr(ctx, 429, ['ip_account_rate_limit_LIMIT', { LIMIT: minMinutes, }], null, state);
            }
        }

        let json_metadata = '';

        let mid;
        if (account.invite_code && !ctx.session.soc_id) {
            if (!user[0][4]) {
                console.log(`api /submit: try to skip use_invite step by user ${ctx.session.uid} #${user_id}`);
                throw new Error('Not passed entering use_invite step');
            }
            else {
              console.log(`api /submit: found use_invite step for user ${ctx.session.uid} #${user_id}`)
            }
        } else if (ctx.session.soc_id && ctx.session.soc_id_type) {
            if (!user[0][4]) {
                console.log(`api /submit: not authorized with social site for user ${ctx.session.uid} #${user_id}`);
                throw new Error('Not authorized with social site');
            }
            else {
              console.log(`api /submit: is authorized with social site for user ${ctx.session.uid} #${user_id}`)
            }
            json_metadata = {[ctx.session.soc_id_type]: ctx.session.soc_id};
            json_metadata = JSON.stringify(json_metadata);
        } else {
            if (!user[0][4]) {
                console.log(`api /submit: not confirmed e-mail for user ${ctx.session.uid} #${user_id}`);
                throw new Error('E-mail is not confirmed');
            }
            else {
              console.log(`api /submit: is confirmed e-mail for user ${ctx.session.uid} #${user_id}`)
            }
        }

        console.log('-- /submit creating account');

        const [fee_value, fee_currency] = config.get('registrar.fee').split(' ');
        const delegation = config.get('registrar.delegation')

        let fee = parseFloat(fee_value);
        let max_referral_interest_rate;
        let max_referral_term_sec;
        let max_referral_break_fee;
        try {
            const chain_properties = await api.getChainPropertiesAsync();
            const chain_fee = parseFloat(chain_properties.account_creation_fee);
            if (chain_fee && chain_fee > fee) {
                if (fee / chain_fee > 0.5) { // just a sanity check - chain fee shouldn't be a way larger
                    console.log('-- /submit warning: chain_fee is larger than config fee -->', ctx.session.uid, fee, chain_fee);
                    fee = chain_fee;
                }
            }
            max_referral_interest_rate = chain_properties.max_referral_interest_rate;
            max_referral_term_sec = chain_properties.max_referral_term_sec;
            max_referral_break_fee = chain_properties.max_referral_break_fee;
        } catch (error) {
            console.error('Error in /submit get_chain_properties', error);
        }

        const dgp = await api.getDynamicGlobalPropertiesAsync();

        let extensions = [];
        if (!account.invite_code && account.referrer)
        {
            extensions = 
            [[
                0, {
                    referrer: account.referrer,
                    interest_rate: max_referral_interest_rate,
                    end_date: new Date(Date.parse(dgp.time) + max_referral_term_sec*1000).toISOString().split(".")[0],
                    break_fee: max_referral_break_fee
                }
            ]];
        }

        await createAccount({
            signingKey: config.get('registrar.signing_key'),
            fee: `${fee.toFixed(3)} ${fee_currency}`,
            creator: config.registrar.account,
            new_account_name: account.name,
            owner: account.owner_key,
            active: account.active_key,
            posting: account.posting_key,
            memo: account.memo_key,
            delegation,
            json_metadata,
            extensions,
            invite_secret: account.invite_code ? account.invite_code : ''
        });

        console.log('-- create_account_with_keys created -->', ctx.session.uid, account.name, user_id, account.owner_key);

        // store email
        let email = account.email || '';

        try {
            await Tarantool.instance('tarantool').insert('accounts',
                [null, user_id, account.name,
                account.owner_key, account.active_key, account.posting_key, account.memo_key,
                ctx.session.r || '', '', Date.now().toString(), email, remote_ip]);
        } catch (error) {
            console.error('!!! Can\'t create account model in /accounts api', ctx.session.uid, error);
        }

        await Tarantool.instance('tarantool').update('users', 'primary', [user_id], [['=', 7, true]])

        state.status = 'ok';
        ctx.body = JSON.stringify({
            ...state,
        });

        await Tarantool.instance('tarantool').call('unlock_entity', user_id.toString());
    });

    app.use(router.routes());
    app.use(router.allowedMethods({ throw: true, }));
}

/**
 @arg signingKey {string|PrivateKey} - WIF or PrivateKey object
 */
var createAccount = async function createAccount({
    signingKey, fee, creator, new_account_name, json_metadata = '',
    owner, active, posting, memo, delegation, extensions, invite_secret = ''
}) {
    let operations = [[(invite_secret == '' ? 'account_create_with_delegation' : 'account_create_with_invite'), {
        fee, creator, new_account_name, json_metadata,
        owner: {weight_threshold: 1, account_auths: [], key_auths: [[owner, 1]]},
        active: {weight_threshold: 1, account_auths: [], key_auths: [[active, 1]]},
        posting: {weight_threshold: 1, account_auths: [], key_auths: [[posting, 1]]},
        memo_key: memo, extensions: extensions
    }]]
    if (invite_secret != '') {
        operations[0][1].invite_secret = invite_secret;
    } else {
        operations[0][1].delegation = delegation;
    }
    await broadcast.sendAsync({
        extensions: [],
        operations
    }, [signingKey])
}
const parseSig = hexSig => {try {return Signature.fromHex(hexSig)} catch(e) {return null}}
