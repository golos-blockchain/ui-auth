const koa_router = require('koa-router');
const koa_body = require('koa-body');
const Tarantool = require('../../db/tarantool');
const golos = require('golos-lib-js');
const { Signature, hash, PublicKey } = require('golos-lib-js/lib/auth/ecc');
const secureRandom = require('secure-random');
const { bodyParams, getRemoteIp, slowDownLimitReq, returnError, } = require('../utils/misc');
const { checkOrigin, } = require('../utils/origin');

module.exports = function useAuthApi(app) {
    const router = koa_router({ prefix: '/api' });

    const koaBody = koa_body();

    let challenges = new Map();
    let sessions = new Map();

    router.post('/login_account', koaBody, async (ctx) => {
        const { account, signatures } = bodyParams(ctx);
        if (!account) {
            return returnError(ctx, 'account is required');
        }

        let authSession = ctx.get('X-Auth-Session');

        let login_challenge = authSession && challenges.get(authSession);

        if (!signatures) { // step 1 or checking auth
            let originErr = checkOrigin(ctx);
            if (originErr) {
                return returnError(ctx, originErr);
            }

            const alreadyAuthorized = sessions.get(authSession);

            if (!login_challenge) {
                authSession = secureRandom.randomBuffer(16).toString('hex')
                login_challenge = secureRandom.randomBuffer(16).toString('hex');
                challenges.set(authSession, login_challenge);
            }

            ctx.set('X-Auth-Session', authSession);
            ctx.body = {
                login_challenge,
                already_authorized: alreadyAuthorized,
                status: 'ok',
            }
        } else { // step 2
            if (!login_challenge) {
                return returnError(ctx, 'no login_challenge in session');
            }

            const [chainAccount] = await golos.api.getAccountsAsync([account]);
            if (!chainAccount) {
                return returnError(ctx, 'missing blockchain account');
            }

            const auth = { posting: false };
            const bufSha = hash.sha256(JSON.stringify({token: login_challenge}, null, 0));
            const verify = (type, sigHex, pubkey, weight, weight_threshold) => {
                if (!sigHex) return
                if (weight !== 1 || weight_threshold !== 1) {
                    console.error(`/login_account login_challenge unsupported ${type} auth configuration: ${account}`);
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
            const { posting: { key_auths: [[posting_pubkey, weight]], weight_threshold } } = chainAccount;
            verify('posting', signatures.posting, posting_pubkey, weight, weight_threshold);
            if (!auth.posting) {
                return returnError(ctx, 'wrong signatures');
            }

            challenges.delete(authSession);
            sessions.set(authSession, account);

            ctx.set('X-Auth-Session', authSession)
            ctx.body = {
                status: 'ok',
            };

            try {
                const res = await Tarantool.instance('tarantool').call('get_guid', account);
                const [ acc, guid ] = res[0][0];
                ctx.body = Object.assign(ctx.body, { guid })
            } catch (e) {}
        }
    });

    router.get('/logout_account', koaBody, (ctx) => {
        const authSession = ctx.get('X-Auth-Session');
        const was_logged_in = sessions.delete(authSession);
        challenges.delete(authSession);
        ctx.body = {
            status: 'ok',
            was_logged_in,
        };
    });

    app.use(router.routes());
    app.use(router.allowedMethods({ throw: true, }));
};
