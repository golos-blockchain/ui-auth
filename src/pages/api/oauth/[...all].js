import secureRandom from 'secure-random';
import golos from 'golos-lib-js';
import config from 'config';
import nextConnect from '@/server/nextConnect';
import { oauthSessionMiddleware, } from '@/server/oauthSession';
import { throwErr, } from '@/server/error';
import { initGolos, } from '@/server/initGolos';
import { noBodyParser, bodyParams, } from '@/server/misc';
import { checkCrossOrigin, forbidCorsOnProd, } from '@/server/origin';
import { clientFromConfig, getClientByOrigin,
    oauthCors, hasAuthority, getMissingPerms, oauthEnabled, } from '@/server/oauth';
import { permissions, initOpsToPerms, } from '@/utils/oauthPermissions';
import Tarantool from '@/server/tarantool';

initGolos();

const opsToPerms = initOpsToPerms(permissions);

const PendingStates = {
    CREATED: 1,
    ACCEPTED: 2,
    FORBIDDEN: 3,
};

let handler = nextConnect({ attachParams: true, })
    .use(oauthCors())
    .use(oauthSessionMiddleware);

if (oauthEnabled()) {
    handler =

    handler.post('/api/oauth/_/authorize', async (req, res) => {
        let params = await bodyParams(req);
        const { account, signatures } = params;
        if (!account) {
            throwErr(req, 400, ['account is required']);
        }

        let login_challenge = req.session.login_challenge;

        if (!signatures) { // step 1 or checking already_authorized
            let originErr = checkCrossOrigin(req);
            if (originErr) {
                throwErr(req, 403, [originErr]);
            }

            const alreadyAuthorized = req.session.account;
            let hasAuth = false;
            if (alreadyAuthorized) {
                const [chainAccount] = await golos.api.getAccountsAsync([req.session.account]);
                hasAuth = hasAuthority(chainAccount, config.get('oauth.service_account.name'));
            }

            if (!login_challenge) {
                login_challenge = secureRandom.randomBuffer(16).toString('hex');
                req.session.login_challenge = login_challenge;
                await req.session.save();
            }

            res.json({
                login_challenge,
                already_authorized: alreadyAuthorized,
                has_authority: hasAuth,
                status: 'ok',
            });
        } else { // step 2
            if (!login_challenge) {
                throwErr(req, 400, ['no login_challenge in session']);
            }

            const [ chainAccount, ] = await golos.api.getAccountsAsync([account]);
            if (!chainAccount) {
                throwErr(req, 400, ['missing blockchain account']);
            }

            const hasAuth = hasAuthority(chainAccount, config.get('oauth.service_account.name'));

            const auth = golos.auth.verifySignedData(
                JSON.stringify({token: login_challenge}, null, 0),
                signatures, chainAccount, ['active']);

            if (!auth.active) {
                throwErr(req, 400, ['wrong signatures']);
            }

            if (hasAuth) {
                req.session.account = account;
                await req.session.save();
            }

            res.json({
                status: 'ok',
                has_authority: hasAuth,
            });
        }
    })

    .post('/api/oauth/_/logout', async (req, res) => {
        forbidCorsOnProd(req);
        const account = req.session.account;
        delete req.session.account;
        delete req.session.clients;
        await req.session.save();
        try {
            await Tarantool.instance('tarantool')
            .call('server_tokens_logout_all',
                account,
            );
        } catch (err) {
            console.error('ERROR: cannot logout all server tokens', err);
        }
        res.json({
            status: 'ok',
        });
    })

    .get('/api/oauth/logout/:client', async (req, res) => {
        const { client, } = req.params;
        if (!req.session.account)
            throwErr(req, 403, ['Not authorized in account']);

        if (checkCrossOrigin(req)) {
            const originFound = getClientByOrigin(req);
            if (client !== originFound) {
                throwErr(req, 403, ['Cannot logout from another client']);
            }
        }
        delete req.session.clients[client];
        await req.session.save();
        try {
            await Tarantool.instance('tarantool')
            .call('server_tokens_logout',
                req.session.account, client,
            );
        } catch (err) {
            console.error('ERROR: cannot logout server token', err);
        }
        res.json({
            status: 'ok',
        });
    })

    // Checks if user authorized in client at general
    .get('/api/oauth/check/:client', async (req, res) => {
        const { client, } = req.params;

        let data = {
            authorized: false,
        };
        if (req.session.clients && req.session.clients[client]) {
            data.authorized = true;
            const { allowed, } = req.session.clients[client];
            data.allowed = allowed;
            data.account = req.session.account;

            try {
                let token = await Tarantool.instance('tarantool')
                .call('server_tokens_get',
                    req.session.account, client,
                );
                token = token[0][0];
                if (token) {
                    data.server_token = token.token;
                }
            } catch (err) {
                console.error('ERROR: cannot get server token', err);
            }
        }
        res.json(data);
    })

    .post('/api/oauth/_/permissions', async (req, res) => {
        let params = await bodyParams(req);
        const { client, allowed, } = params;
        if (!client)
            throwErr(req, 400, ['client is required']);

        if (!req.session.account)
            throwErr(req, 403, ['Not authorized in account']);

        // client cannot permit it by itself :)
        let originErr = checkCrossOrigin(req);
        if (originErr)
            throwErr(req, 403, [originErr]);

        let cfgClient = 'oauth.allowed_clients.' + client;
        if (!config.has(cfgClient))
            throwErr(req, 400, ['Such client is not exist']);

        if (!req.session.clients) {
            req.session.clients = {};
        }
        if (!allowed) {
            delete req.session.clients[client];
            await req.session.save();
            res.json({
                status: 'ok',
            });
            return;
        } 
        req.session.clients[client] = {
            allowed,
        };
        await req.session.save();

        const token = secureRandom.randomBuffer(16).toString('hex');
        try {
            await Tarantool.instance('tarantool')
            .call('server_tokens_create',
                req.session.account, client, token,
            );
        } catch (err) {
            console.error('ERROR: cannot add server token', err);
        }
        res.json({
            status: 'ok',
        });
    })

    // Checks if specific transaction allowed
    .post('/api/oauth/check/:client', async (req, res) => {
        if (!checkCrossOrigin(req)) {
            res.json({
                status: 'ok',
            });
            return;
        }

        let clientFound = getClientByOrigin(req);

        let requiredPerms = new Set();
        let errorMsg = '';

        let params = await bodyParams(req);
        const { tx, } = params;

        for (const op of tx.operations) {
            let { allowed, required, } = getMissingPerms(req, opsToPerms, clientFound, op);

            if (!allowed && !required.length) {
                throwErr(req, 400, ['Such case of operation ' + op[0] + ' is not supported by OAuth']);
            }
            if (!allowed) {
                required.forEach(requiredPerms.add, requiredPerms);
                errorMsg += 'Operation ' + op[0] + ` in this case is not allowed for '${clientFound}' client. `
                        + 'It requires: ' + required.join(' or ') + '\n';
            }
        }

        if (errorMsg) {
            throwErr(req, 400, [errorMsg], null, {
                requiredPerms: Array.from(requiredPerms),
            });
        }

        res.json({
            status: 'ok',
        });
    })

    .post('/api/oauth/prepare_pending', async (req, res) => {
        let clientFound = getClientByOrigin(req);

        let params = await bodyParams(req);
        const { tx, txHash, } = params;
        if (!tx) throwErr(req, 400, ['tx is required']);
        if (!txHash) throwErr(req, 400, ['txHash is required']);
        
        const txHash0 = golos.oauth._hashOps(tx.operations);

        if (txHash !== txHash0) {
            console.error('Wrong txHash', tx.operations);
            throwErr(req, 400, ['Wrong txHash']);
        }

        const prepareRes = await Tarantool.instance('tarantool')
            .call('oauth_prepare_tx',
                clientFound, txHash,
                JSON.stringify(tx)
            );

        res.json({
            status: 'ok',
        });
    })

    .get('/api/oauth/_/load_pending/:client/:txHash', async (req, res) => {
        forbidCorsOnProd(req);
        const { client, txHash, } = req.params;

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
                res.json({
                    status: 'ok',
                    data: tx,
                });
                return;
            }
        }
        throwErr(req, 400, ['Pending tx not found']);
    })

    .post('/api/oauth/_/forbid_pending/:client/:txHash', async (req, res) => {
        forbidCorsOnProd(req);

        const { client, txHash, } = req.params;

        let txRes = await Tarantool.instance('tarantool')
            .call('oauth_state_tx',
                client, txHash, PendingStates.FORBIDDEN,
            );
        if (txRes[0][0]) {
            res.json({
                status: 'ok',
            });
            return;
        }
        throwErr(req, 400, ['Pending tx not found']);
    })

    .post('/api/oauth/_/return_pending/:client/:txHash', async (req, res) => {
        forbidCorsOnProd(req);

        const { client, txHash, } = req.params;

        let params = await bodyParams(req);
        const { err, } = params;
        const result = params.res;
        // validation
        if (err) JSON.parse(err);
        if (result) JSON.parse(result);

        let txRes = await Tarantool.instance('tarantool')
            .call('oauth_return_tx',
                client, txHash, err, result,
            );
        if (txRes[0][0]) {
            res.json({
                status: 'ok',
            });
            return;
        }
        throwErr(req, 400, ['Pending tx not found']);
    })

    .get('/api/oauth/wait_for_pending/:txHash', async (req, res) => {
        const client = getClientByOrigin(req);
        const { txHash, } = req.params;
        let txRes = await Tarantool.instance('tarantool')
            .call('oauth_get_txs',
                client, txHash, PendingStates.ACCEPTED,
            );
        if (txRes[0][0]) {
            const tx = txRes[0][0];
            if (tx.client === client && tx.tx_hash === txHash) {
                let data = {
                    status: 'ok',
                };
                if (tx.state === PendingStates.FORBIDDEN) {
                    data.forbidden = true;
                } else {
                    data.err = tx.err ? JSON.parse(tx.err) : null;
                    data.res = tx.res ? JSON.parse(tx.res) : null;
                }
                res.json(data);
                return;
            }
        }
        throwErr(req, 400, ['Pending tx not found']);
    })

    .get('/api/oauth/check_server_token/:token', async (req, res) => {
        const { token, } = req.params;
        let tokenData;
        try {
            tokenData = await Tarantool.instance('tarantool')
            .call('server_tokens_check',
                token,
            );
            tokenData = tokenData[0][0];
        } catch (err) {
            console.error('ERROR: cannot add server token', err);
        }
        res.json({
            status: 'ok',
            ...tokenData,
        });
    })

    .get('/api/oauth/get_client/:client/:locale?', (req, res) => {
        const { client, } = req.params;
        const locale = req.params.locale || 'ru';
        const clientMeta = clientFromConfig(client, locale);
        res.json({
            status: 'ok',
            client: clientMeta,
        });
    })
} // END: if (oauthEnabled())

export default handler;

export {
    noBodyParser as config,
};
