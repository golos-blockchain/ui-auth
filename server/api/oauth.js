const koa_router = require('koa-router');
const koa_body = require('koa-body');
const config = require('config');
const golos = require('golos-lib-js');
const secureRandom = require('secure-random');
const JsonRPC = require('simple-jsonrpc-js');
const Tarantool = require('../../db/tarantool');
const session = require('../utils/cryptoSession');
const { bodyParams, throwErr, } = require('../utils/misc');
const { checkCrossOrigin, forbidCorsOnProd, } = require('../utils/origin');
const { getClientByOrigin, clientFromConfig,
    hasAuthority, getRequiredPerms, getMissingPerms, } = require('../utils/oauth');
const { permissions, initOpsToPerms, } = require('../utils/oauthPermissions');

const PendingStates = {
    CREATED: 1,
    ACCEPTED: 2,
    FORBIDDEN: 3,
};

module.exports = function useOAuthApi(app) {
    const opsToPerms = initOpsToPerms(permissions);

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

    async function clearPendings() {
        console.log('clearPendings');
        try {
            await Tarantool.instance('tarantool')
                .call('oauth_cleanup',);
        } catch (err) {
            console.error(err);
        }
        setTimeout(clearPendings,
            (process.env.NODE_ENV === 'production' ? 300 : 10) * 1000);
    }
    clearPendings();

    router.get('/_/get_client/:client/:locale?', koaBody, async (ctx) => {
        forbidCorsOnProd(ctx);
        const { client, locale, } = ctx.params;
        let clientMeta = clientFromConfig(client, locale);
        if (ctx.session.clients && clientMeta) {
            const clientS = ctx.session.clients[client];
            if (clientS) {
                clientMeta.authorized = true;
                clientMeta.allowed = clientS.allowed;
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
            service_account: config.get('oauth.service_account.name'),
        };
        if (with_clients === 'true') {
            ctx.body.clients = {};
            for (const client in ctx.session.clients) {
                let clientMeta = clientFromConfig(client, locale);
                if (clientMeta) {
                    const clientS = ctx.session.clients[client];
                    clientMeta.allowed = clientS.allowed;
                    ctx.body.clients[client] = clientMeta;
                }
            }
        }
    });

    router.post('/_/permissions', koaBody, async (ctx) => {
        const { client, allowed, } = bodyParams(ctx);
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
        if (!allowed) {
            delete ctx.session.clients[client];
            ctx.body = {
                status: 'ok',
            };
            return;
        } 
        ctx.session.clients[client] = {
            allowed,
        };
        ctx.body = {
            status: 'ok',
        };
    });

    // Checks if user authorized in client at general
    router.get('/check/:client', koaBody, async (ctx) => {
        const { client, } = ctx.params;

        ctx.body = {
            authorized: false,
        };
        if (ctx.session.clients && ctx.session.clients[client]) {
            ctx.body.authorized = true;
            const { allowed, } = ctx.session.clients[client];
            ctx.body.allowed = allowed;
            ctx.body.account = ctx.session.account;
        }
    });

    // Checks if specific transaction allowed
    router.post('/check/:client', koaBody, async (ctx) => {
        if (!checkCrossOrigin(ctx)) {
            ctx.body = {
                status: 'ok',
            };
            return;
        }

        let clientFound = getClientByOrigin(ctx);

        let requiredPerms = new Set();
        let errorMsg = '';

        const { tx, } = bodyParams(ctx);

        for (const op of tx.operations) {
            let { allowed, required, } = getMissingPerms(ctx, opsToPerms, clientFound, op);

            if (!allowed && !required.length) {
                throwErr(ctx, 400, ['Such case of operation ' + op[0] + ' is not supported by OAuth']);
            }
            if (!allowed) {
                required.forEach(requiredPerms.add, requiredPerms);
                errorMsg += 'Operation ' + op[0] + ` in this case is not allowed for '${clientFound}' client. `
                        + 'It requires: ' + required.join(' or ') + '\n';
            }
        }

        if (errorMsg) {
            throwErr(ctx, 400, [errorMsg], null, {
                requiredPerms: Array.from(requiredPerms),
            });
        }

        ctx.body = {
            status: 'ok',
        };
    });

    router.post('/prepare_pending', koaBody, async (ctx) => {
        let clientFound = getClientByOrigin(ctx);

        const { tx, txHash, } = bodyParams(ctx);
        if (!tx) throwErr(ctx, 400, ['tx is required']);
        if (!txHash) throwErr(ctx, 400, ['txHash is required']);
        
        const txHash0 = golos.oauth._hashOps(tx.operations);

        if (txHash !== txHash0) {
            console.error('Wrong txHash', tx.operations);
            throwErr(ctx, 400, ['Wrong txHash']);
        }

        const prepareRes = await Tarantool.instance('tarantool')
            .call('oauth_prepare_tx',
                clientFound, txHash,
                JSON.stringify(tx)
            );

        ctx.body = {
            status: 'ok',
        };
    });

    router.get('/_/load_pending/:client/:txHash', koaBody, async (ctx) => {
        forbidCorsOnProd(ctx);
        const { client, txHash, } = ctx.params;

        let txRes = await Tarantool.instance('tarantool')
            .call('oauth_get_txs',
                client, txHash, PendingStates.CREATED,
            );
        if (txRes[0][0]) {
            const tx = txRes[0][0];
            if (tx.client === client && tx.tx_hash === txHash) {
                if (tx.state > PendingStates.CREATED) {
                    tx.expired = true;
                }
                tx.tx = JSON.parse(tx.tx);
                ctx.body = {
                    status: 'ok',
                    data: tx,
                };
                return;
            }
        }
        throwErr(ctx, 400, ['Pending tx not found']);
    });

    router.post('/_/forbid_pending/:client/:txHash', koaBody, async (ctx) => {
        forbidCorsOnProd(ctx);

        const { client, txHash, } = ctx.params;

        let txRes = await Tarantool.instance('tarantool')
            .call('oauth_state_tx',
                client, txHash, PendingStates.FORBIDDEN,
            );
        if (txRes[0][0]) {
            ctx.body = {
                status: 'ok',
            };
            return;
        }
        throwErr(ctx, 400, ['Pending tx not found']);
    });

    router.post('/_/return_pending/:client/:txHash', koaBody, async (ctx) => {
        forbidCorsOnProd(ctx);

        const { client, txHash, } = ctx.params;

        const { err, res, } = bodyParams(ctx);
        // validation
        if (err) JSON.parse(err);
        if (res) JSON.parse(res);

        let txRes = await Tarantool.instance('tarantool')
            .call('oauth_return_tx',
                client, txHash, err, res,
            );
        if (txRes[0][0]) {
            ctx.body = {
                status: 'ok',
            };
            return;
        }
        throwErr(ctx, 400, ['Pending tx not found']);
    });

    router.get('/wait_for_pending/:txHash', koaBody, async (ctx) => {
        const client = getClientByOrigin(ctx);
        const { txHash, } = ctx.params;
        let txRes = await Tarantool.instance('tarantool')
            .call('oauth_get_txs',
                client, txHash, PendingStates.ACCEPTED,
            );
        if (txRes[0][0]) {
            const tx = txRes[0][0];
            if (tx.client === client && tx.tx_hash === txHash) {
                ctx.body = {
                    status: 'ok',
                };
                if (tx.state === PendingStates.FORBIDDEN) {
                    ctx.body.forbidden = true;
                } else {
                    ctx.body.err = tx.err ? JSON.parse(tx.err) : null;
                    ctx.body.res = tx.res ? JSON.parse(tx.res) : null;
                }
                return;
            }
        }
        throwErr(ctx, 400, ['Pending tx not found']);
    });

    router.post('/_/authorize', koaBody, async (ctx) => {
        const { account, signatures } = bodyParams(ctx);
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
        delete ctx.session.clients;
        ctx.body = {
            status: 'ok',
        }
    });

    router.get('/logout/:client', koaBody, async (ctx) => {
        const { client, } = ctx.params;
        if (!ctx.session.account)
            throwErr(ctx, 403, ['Not authorized in account']);

        if (checkCrossOrigin(ctx)) {
            const originFound = getClientByOrigin(ctx);
            if (client !== originFound) {
                throwErr(ctx, 403, ['Cannot logout from another client']);
            }
        }
        delete ctx.session.clients[client];
        ctx.body = {
            status: 'ok',
        };
    });

    router.post('/sign', koa_body({ includeUnparsed: true, }), async (ctx) => {
        ctx.set('Content-Type', 'application/json');

        let jrpc = new JsonRPC();

        const INVALID_REQUEST = -32600;

        jrpc.on('call', 'pass', async (params) =>{
            if (params.length < 2 || params.length > 3) {
                throw jrpc.customException(INVALID_REQUEST, 'A member "params" should be ["api", "method", "args"]');
            }

            let [ api, method, args ] = params;
            if (!Array.isArray(args)) {
                throw jrpc.customException(INVALID_REQUEST, 'A member "args" should be array');
            }

            const isBroadcast = 
                (api == 'network_broadcast_api') &&
                (method === 'broadcast_transaction' || method === 'broadcast_transaction_with_callback');

            let sendAsync = null;
            if (isBroadcast) {
                sendAsync = async () => {
                    let keys = new Set();

                    let clientFound = null;
                    if (checkCrossOrigin(ctx)) {
                        clientFound = getClientByOrigin(ctx);
                    }

                    const postingKey = config.get('oauth.service_account.posting');
                    const activeKey = config.get('oauth.service_account.active');

                    for (const op of args[0].operations) {
                        if (clientFound) {
                            let { allowed, required, } = getMissingPerms(ctx, opsToPerms, clientFound, op);

                            if (!allowed && !required.length) {
                                throw new Error('Such case of operation ' + op[0] + ' is not supported by OAuth');
                            }
                            if (!allowed) {
                                throw new Error('Operation ' + op[0] + ` in this case is not allowed for '${clientFound}' client. `
                                        + 'It requires: ' + required.join(' or '));
                            }
                        } else {
                            let required = getRequiredPerms(ctx, opsToPerms, op)
                            if (!required.length) {
                                throw new Error('Such case of operation ' + op[0] + ' is not supported by OAuth');
                            }
                        }

                        let roles = args[0]._meta && args[0]._meta._keys;
                        if (roles && roles.length) {
                            roles = roles.slice(0, 6);
                            for (let role of roles) {
                                if (role === 'posting') {
                                    keys.add(postingKey);
                                } else if (role === 'active') {
                                    keys.add(activeKey);
                                } else {
                                    new Error(role + ' key is not supported');
                                }
                            }
                        } else {
                            roles = golos.broadcast._operations[op[0]].roles;
                            if (roles[0]) {
                                if (roles[0] === 'posting') {
                                    keys.add(postingKey);
                                } else if (roles[0] === 'active') {
                                    keys.add(activeKey);
                                } else {
                                    throw new Error('Operations with owner roles not supported');
                                }
                            }
                        }
                    }

                    let _meta = { ...args[0]._meta, };
                    delete args[0]._meta;

                    //if (ctx.session.clients[originFound].onlyOnce) {
                    //    delete ctx.session.clients[originFound];
                    //}

                    return {...await golos.broadcast.sendAsync(
                        args[0], [...keys]), _meta};
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
            let gprops = await golos.api.getDynamicGlobalPropertiesAsync();
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
