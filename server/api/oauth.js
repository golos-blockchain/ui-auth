const koa_router = require('koa-router');
const koa_body = require('koa-body');
const config = require('config');
const golos = require('golos-lib-js');
const { Signature, hash, PublicKey } = require('golos-lib-js/lib/auth/ecc');
const secureRandom = require('secure-random');
const JsonRPC = require('simple-jsonrpc-js');
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

            const auth = golos.auth.verifySignedData(
                JSON.stringify({token: login_challenge}, null, 0),
                signatures, chainAccount, ['active']);

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

    router.post('/sign', koa_body({ includeUnparsed: true, }), async (ctx) => {
        ctx.set('Content-Type', 'application/json');

        let jrpc = new JsonRPC();

        const INVALID_REQUEST = -32600;

        jrpc.on('call', 'pass', async (params) =>{
            if (params.length < 2 || params.length > 3) {
                throw jrpc.customException(INVALID_REQUEST, 'A member "params" should be ["api", "method", "args"]');
            }

            const [ api, method, args ] = params;
            if (!Array.isArray(args)) {
                throw jrpc.customException(INVALID_REQUEST, 'A member "args" should be array');
            }

            const isBroadcast = 
                (api == 'network_broadcast_api') &&
                (method === 'broadcast_transaction');

            let sendAsync = null;
            if (isBroadcast) {
                const postingKey = config.get('oauth.service_account.posting');
                const activeKey = config.get('oauth.service_account.active');

                let keys = new Set();

                for (const op of args[0].operations) {
                    const roles = golos.broadcast._operations[op[0]].roles;
                    if (roles[0]) {
                        if (roles[0] === 'posting') {
                            keys.add(postingKey);
                        } else if (roles[0] === 'active') {
                            keys.add(activeKey);
                        } else {
                            throw jrpc.customException(INVALID_REQUEST, 'Operations with owner roles not supported');
                        }
                    }
                }

                sendAsync = async () => {
                    return await golos.broadcast.sendAsync(
                        args[0], [...keys]);
                };
            } else {
                sendAsync = async () => {
                    return await golos.api.sendAsync(
                        api,
                        {
                            method,
                            params: args,
                        });
                };
            }

            let result;
            try {
                result = await sendAsync();
            } catch (error) {
                if (error.payload) {
                    const { code, message, data } = error.payload.error;
                    throw jrpc.customException(code, message, data);
                } else { // http
                    const { code, message, data } = error;
                    throw jrpc.customException(code, message, data);
                }
            }

            return result;
        });

        jrpc.toStream = (message) => {
            ctx.body = message;
        };

        try {
            const rawBody = ctx.request.body[Symbol.for('unparsedBody')];

            await jrpc.messageHandler(rawBody);
        } catch (err) {
            console.error('/sign', rawBody);
        }
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
