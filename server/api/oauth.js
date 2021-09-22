const koa_router = require('koa-router');
const koa_body = require('koa-body');
const config = require('config');
const golos = require('golos-classic-js');
const { Signature, hash, PublicKey } = require('golos-classic-js/lib/auth/ecc');
const secureRandom = require('secure-random');
const session = require('../utils/cryptoSession');
const { throwErr, } = require('../utils/misc');

const checkCrossOrigin = (ctx) => {
    let originHost = null;
    try {
        originHost = new URL(ctx.get('origin'));
    } catch (err) {
        return 'Origin cannot be parsed: ' + origin;
    }
    originHost = originHost.hostname;
    if (!originHost) {
        return 'Origin is wrong: ' + origin;
    }
    let ownHost = null;
    try {
        ownHost = new URL(config.get('oauth.rest_api')).hostname;
    } catch (err) {
        console.error('oauth.rest_api cannot be parsed as URL');
        return 'oauth.rest_api cannot be parsed as URL';
    }
    const same = ownHost === originHost;
    if (same) {
        return false;
    }
    return ownHost + ' !== ' + originHost;
};

const hasAuthority = (acc, serviceAccountName) => {
    if (!acc)
        return false;
    if (!acc.active || !acc.active.account_auths)
        return false;
    if (!acc.posting || !acc.posting.account_auths)
        return false;
    const hasActive = acc.active.account_auths.find(auth => {
        return auth[1] === 1 && auth[0] === serviceAccountName;
    });
    const hasPosting = acc.posting.account_auths.find(auth => {
        return auth[1] === 1 && auth[0] === serviceAccountName;
    });
    return hasActive && hasPosting;
};

module.exports = function useOAuthApi(app) {
    const router = koa_router({ prefix: '/api/oauth' });

    const crypto_key = config.get('oauth.server_session_secret');

    session(router, {
        maxAge: 1000 * 3600 * 24 * 60,
        crypto_key,
        key: 'X-OAuth-Session',
    });

    const koaBody = koa_body();

    router.get('/get_client/:client', koaBody, async (ctx) => {
        ctx.body = {
        };
    });

    router.get('/get_config', koaBody, async (ctx) => {
        ctx.body = {
            ws_connection_client: config.get('oauth.ws_connection_client'),
            chain_id: config.has('chain_id') && config.get('oauth.chain_id'),
            service_account: config.get('oauth.service_account.name'),
        };
    });

    router.get('/get_session', koaBody, async (ctx) => {
        if (!ctx.session.account) {
            ctx.body = {
                account: null,
            };
            return;
        }
        ctx.body = {
            account: ctx.session.account,
            sign_endpoint: new URL('/api/oauth/sign', config.get('oauth.rest_api')).toString(),
        };
    });

    router.post('/check_auth', koaBody, async (ctx) => {
    });

    router.post('/authorize', koaBody, async (ctx) => {
        let params = ctx.request.body;
        if (typeof(params) === 'string') params = JSON.parse(params);
        const { account, signatures } = params;
        if (!account) {
            throwErr(ctx, 400, ['account is required']);
        }

        let login_challenge = ctx.session.login_challenge;

        if (!signatures) { // step 1 or checking already_authorized
            let originErr = checkCrossOrigin(ctx);
            if (originErr) {
                throwErr(ctx, 403, [originErr]);
            }

            const alreadyAuthorized = ctx.session.account;
            let hasAuth = false;
            if (alreadyAuthorized) {
                const [chainAccount] = await golos.api.getAccountsAsync([ctx.session.account]);
                hasAuth = hasAuthority(chainAccount, config.get('oauth.service_account.name'));
            }

            if (!login_challenge) {
                login_challenge = secureRandom.randomBuffer(16).toString('hex');
                ctx.session.login_challenge = login_challenge;
            }

            ctx.body = {
                login_challenge,
                already_authorized: alreadyAuthorized,
                has_authority: hasAuth,
                status: 'ok',
            };
        } else { // step 2
            if (!login_challenge) {
                throwErr(ctx, 400, ['no login_challenge in session']);
            }

            const [chainAccount] = await golos.api.getAccountsAsync([account]);
            if (!chainAccount) {
                throwErr(ctx, 400, ['missing blockchain account']);
            }

            const hasAuth = hasAuthority(chainAccount, config.get('oauth.service_account.name'));

            const auth = { posting: false };
            const bufSha = hash.sha256(JSON.stringify({token: login_challenge}, null, 0));
            const verify = (type, sigHex, pubkey, weight, weight_threshold) => {
                if (!sigHex) return
                if (weight !== 1 || weight_threshold !== 1) {
                    console.error(`/authorize login_challenge unsupported ${type} auth configuration: ${account}`);
                } else {
                    const parseSig = hexSig => {
                        try {
                            return Signature.fromHex(hexSig);
                        } catch(e) {
                            return null;
                        }
                    };
                    const sig = parseSig(sigHex)
                    const public_key = PublicKey.fromString(pubkey)
                    const verified = sig.verifyHash(bufSha, public_key)
                    auth[type] = verified
                }
            }
            const { active: { key_auths: [[active_pubkey, weight]], weight_threshold } } = chainAccount;
            verify('active', signatures.active, active_pubkey, weight, weight_threshold);
            if (!auth.active) {
                throwErr(ctx, 400, ['wrong signatures']);
            }

            if (hasAuth) {
                ctx.session.account = account;
            }

            ctx.body = {
                status: 'ok',
                has_authority: hasAuth,
            };
        }
    });

    router.get('/logout', koaBody, async (ctx) => {
        delete ctx.session.account;
    });

    router.post('/sign', koaBody, async (ctx) => {
        console.log(ctx.request.body);
    });

    router.get('/balances/:account/:action', koaBody, async (ctx) => {
        const { action, account, } = ctx.params;
        ctx.body = {
            balances: {
                'GOLOS': '0.000 GOLOS',
            },
        };
        if (action !== 'donate') {
            ctx.body.balances['GBG'] = '0.000 GBG';
        }

        let acc = await golos.api.getAccountsAsync([account]);
        if (!acc[0]) {
            return;
        }
        acc = acc[0];

        ctx.body.balances['GOLOS'] = (action === 'donate') ? acc.tip_balance : acc.balance;
        if (ctx.body.balances['GBG'])
            ctx.body.balances['GBG'] = acc.sbd_balance;
    });

    app.use(router.routes());
    app.use(router.allowedMethods({ throw: true, }));
};
