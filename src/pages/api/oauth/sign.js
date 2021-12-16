import nc from 'next-connect';
import config from 'config';
import golos from 'golos-lib-js';
import JsonRPC from 'simple-jsonrpc-js';
import { throwErr, onError, makeNoMatch, } from '@/server/error';
import { initGolos, } from '@/server/initGolos';
import { rateLimitReq, getRemoteIp, noBodyParser, bodyString, } from '@/server/misc';
import { oauthSessionMiddleware, } from '@/server/oauthSession';
import { oauthCors, getClientByOrigin,
    getMissingPerms, getRequiredPerms,
    oauthEnabled, } from '@/server/oauth';
import { checkCrossOrigin, } from '@/server/origin';
import { permissions, initOpsToPerms, } from '@/utils/oauthPermissions';

initGolos();

let handler;

const onNoMatch = makeNoMatch(() => handler);

const opsToPerms = initOpsToPerms(permissions);

handler = nc({ onError, onNoMatch, })
    .use(oauthCors())
    .use(oauthSessionMiddleware);

if (oauthEnabled()) {
    handler =

    handler.post('/api/oauth/sign', async (req, res) => {
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
                    if (checkCrossOrigin(req)) {
                        clientFound = getClientByOrigin(req);
                    }

                    const postingKey = config.get('oauth.service_account.posting');
                    const activeKey = config.get('oauth.service_account.active');

                    let trx = method === 'broadcast_transaction_with_callback' ? args[1] : args[0];

                    for (const op of trx.operations) {
                        if (clientFound) {
                            let { allowed, required, } = getMissingPerms(req, opsToPerms, clientFound, op);

                            if (!allowed && !required.length) {
                                throw new Error('Such case of operation ' + op[0] + ' is not supported by OAuth');
                            }
                            if (!allowed) {
                                throw new Error('Operation ' + op[0] + ` in this case is not allowed for '${clientFound}' client. `
                                        + 'It requires: ' + required.join(' or '));
                            }
                        } else {
                            let required = getRequiredPerms(req, opsToPerms, op)
                            if (!required.length) {
                                throw new Error('Such case of operation ' + op[0] + ' is not supported by OAuth');
                            }
                        }

                        let roles = trx._meta && trx._meta._keys;
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

                    let _meta = { ...trx._meta, };
                    delete trx._meta;

                    //if (req.session.clients[originFound].onlyOnce) {
                    //    delete req.session.clients[originFound];
                    //}

                    return {...await golos.broadcast.sendAsync(
                        trx, [...keys]), _meta};
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
            res.setHeader('Content-Type', 'application/json')
                .send(message);
        };

        try {
            const rawBody = await bodyString(req);

            await jrpc.messageHandler(rawBody);
        } catch (err) {
            console.error('/sign', rawBody);
        }
    })
} // END: if (oauthEnabled())

export default handler;

export {
    noBodyParser as config,
};
