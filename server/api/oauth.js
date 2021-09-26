const koa_router = require('koa-router');
const koa_body = require('koa-body');
const config = require('config');
const golos = require('golos-lib-js');
const { Signature, hash, PublicKey } = require('golos-lib-js/lib/auth/ecc');
const secureRandom = require('secure-random');
const JsonRPC = require('simple-jsonrpc-js');
const session = require('../utils/cryptoSession');
const { throwErr, } = require('../utils/misc');
const { getOrigin, checkCrossOrigin, forbidCorsOnProd, } = require('../utils/origin');

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

    if (process.env.NODE_ENV === 'production') {
        router.use(async (ctx, next) => {
            ctx.cookies.secure = true;
            await next();
        });
    }
    session(router, {
        maxAge: 1000 * 3600 * 24 * 60,
        crypto_key,
        key: 'X-OAuth-Session',
        sameSite: 'none',
        secure: process.env.NODE_ENV === 'production',
    });

    const koaBody = koa_body();

    const clientFromConfig = (client, locale) => {
        const cfgKey = 'oauth.allowed_clients.' + client;
        const clientCfg = config.has(cfgKey) && config.get(cfgKey);

        let clientMeta = null;
        if (clientCfg) {
            clientMeta = {};
            clientMeta.logo = '/oauth_clients/' + clientCfg.logo;
            let loc = 'ru';
            if (locale && clientCfg[locale])
                loc = locale;
            if (!clientCfg[loc])
                loc = 'en';
            clientMeta.title = clientCfg[loc].title;
            clientMeta.description = clientCfg[loc].description;
        }
        return clientMeta;
    };

    router.get('/_/get_client/:client/:locale?', koaBody, async (ctx) => {
        forbidCorsOnProd(ctx);
        const { client, locale, } = ctx.params;
        let clientMeta = clientFromConfig(client, locale);
        if (ctx.session.clients && clientMeta) {
            const clientS = ctx.session.clients[client];
            if (clientS) {
                clientMeta.authorized = true;
                clientMeta.allowActive = clientS.allowActive;
                clientMeta.allowPosting = clientS.allowPosting;
            }
        }

        ctx.body = {
            client: clientMeta,
        };
    });

    router.get('/_/get_config', koaBody, async (ctx) => {
        forbidCorsOnProd(ctx);
        ctx.body = {
            ws_connection_client: config.get('oauth.ws_connection_client'),
            chain_id: config.has('chain_id') && config.get('oauth.chain_id'),
            service_account: config.get('oauth.service_account.name'),
        };
    });

    router.get('/_/get_session/:with_clients/:locale', koaBody, async (ctx) => {
        forbidCorsOnProd(ctx);
        const { with_clients, locale, } = ctx.params;
        if (!ctx.session.account) {
            ctx.body = {
                account: null,
                client: {},
            };
            return;
        }
        ctx.body = {
            account: ctx.session.account,
            sign_endpoint: new URL('/api/oauth/sign', config.get('oauth.rest_api')).toString(),
        };
        if (with_clients === 'true') {
            ctx.body.clients = {};
            for (const client in ctx.session.clients) {
                let clientMeta = clientFromConfig(client, locale);
                if (clientMeta) {
                    const clientS = ctx.session.clients[client];
                    clientMeta.allowActive = clientS.allowActive;
                    clientMeta.allowPosting = clientS.allowPosting;
                    ctx.body.clients[client] = clientMeta;
                }
            }
        }
    });

    router.post('/_/permissions', koaBody, async (ctx) => {
        let params = ctx.request.body;
        if (typeof(params) === 'string') params = JSON.parse(params);
        const { client, allowPosting, allowActive, onlyOnce,} = params;
        if (!client)
            throwErr(ctx, 400, ['client is required']);

        if (!ctx.session.account)
            throwErr(ctx, 403, ['Not authorized in account']);

        // client cannot permit it by itself :)
        let originErr = checkCrossOrigin(ctx);
        if (originErr)
            throwErr(ctx, 403, [originErr]);

        let cfgClient = 'oauth.allowed_clients.' + client;
        if (!config.has(cfgClient))
            throwErr(ctx, 400, ['Such client is not exist']);

        if (!ctx.session.clients)
            ctx.session.clients = {};
        if (!allowPosting && !allowActive) {
            delete ctx.session.clients[client];
            ctx.body = {
                status: 'ok',
            };
            return;
        } 
        ctx.session.clients[client] = {
            allowPosting,
            allowActive,
            onlyOnce,
        };
        ctx.body = {
            status: 'ok',
        };
    });

    router.get('/check/:client', koaBody, async (ctx) => {
        const { client, } = ctx.params;

        ctx.body = {
            authorized: false,
        };
        if (ctx.session.clients && ctx.session.clients[client]) {
            ctx.body.authorized = true;
            const { allowActive, allowPosting, onlyOnce, } = ctx.session.clients[client];
            ctx.body.allowPosting = allowPosting;
            ctx.body.allowActive = allowActive;
            ctx.body.onlyOnce = onlyOnce;
            ctx.body.account = ctx.session.account;
        }
    });

    router.post('/_/authorize', koaBody, async (ctx) => {
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

    router.get('/_/logout', koaBody, async (ctx) => {
        forbidCorsOnProd(ctx);
        delete ctx.session.account;
        ctx.body = {
            status: 'ok',
        }
    });

    router.get('/logout/:client', koaBody, async (ctx) => {
        const { client, } = ctx.params;
        if (!ctx.session.account)
            throwErr(ctx, 403, ['Not authorized in account']);

        let originFound = null;
        const origin = getOrigin(ctx);
        if (ctx.session.clients) {
            for (const client in ctx.session.clients) {
                let cfgClient = 'oauth.allowed_clients.' + client;
                if (!config.has(cfgClient))
                    continue;
                cfgClient = config.get(cfgClient);
                if (cfgClient.origins && cfgClient.origins.includes(origin)) {
                    originFound = client;
                    break;
                }
            }
        }
        if (!originFound) {
            throw new Error(`Origin '${origin}' is not allowed, authorize please`);
        }
        delete ctx.session.clients[originFound];
        ctx.body = {
            status: 'ok',
        }
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
                let usedRoles = new Set();

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
                        usedRoles.add(roles[0]);
                    }
                }

                sendAsync = async () => {
                    if (checkCrossOrigin(ctx)) {
                        let originFound = null;
                        const origin = getOrigin(ctx);
                        if (ctx.session.clients) {
                            for (const client in ctx.session.clients) {
                                let cfgClient = 'oauth.allowed_clients.' + client;
                                if (!config.has(cfgClient))
                                    continue;
                                cfgClient = config.get(cfgClient);
                                if (cfgClient.origins && cfgClient.origins.includes(origin)) {
                                    originFound = client;
                                    break;
                                }
                            }
                        }
                        if (!originFound) {
                            throw new Error(`Origin '${origin}' is not allowed, authorize please`);
                        }
                        if (usedRoles.has('active') && !ctx.session.clients[originFound].allowActive) {
                            throw new Error(`active is not allowed for '${originFound}' client`)
                        }
                        if (ctx.session.clients[originFound].onlyOnce) {
                            delete ctx.session.clients[originFound];
                        }
                    }

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

    router.get('/_/balances/:account/:action', koaBody, async (ctx) => {
        forbidCorsOnProd(ctx);
        const { action, account, } = ctx.params;
        ctx.body = {
            balances: {
                'GOLOS': '0.000 GOLOS',
            },
        };
        if (action === 'transfer') {
            ctx.body.balances['GBG'] = '0.000 GBG';
        }

        let acc = await golos.api.getAccountsAsync([account]);
        if (!acc[0]) {
            return;
        }
        acc = acc[0];

        if (action === 'delegate_vs') {
            let gprops = await golos.api.getDynamicGlobalProperties();
            acc.vesting_shares = (parseFloat(acc.vesting_shares) - parseFloat(acc.delegated_vesting_shares)).toFixed(6) + ' GESTS';
            ctx.body.balances['GOLOS'] = golos.formatter.vestingGolos(acc, gprops).toFixed(3) + ' GOLOS';
            ctx.body.cprops = await golos.api.getChainPropertiesAsync();
            ctx.body.gprops = gprops;
            return;
        }

        ctx.body.balances['GOLOS'] = (action === 'donate') ? acc.tip_balance : acc.balance;
        if (ctx.body.balances['GBG'])
            ctx.body.balances['GBG'] = acc.sbd_balance;

        let uia = await golos.api.getAccountsBalancesAsync([account]);
        if (!uia[0]) {
            return;
        }
        uia = uia[0];
        for (const sym in uia) {
            ctx.body.balances[sym] = (action === 'donate') ? uia[sym].tip_balance : uia[sym].balance;
        }
    });

    app.use(router.routes());
    app.use(router.allowedMethods({ throw: true, }));
};
