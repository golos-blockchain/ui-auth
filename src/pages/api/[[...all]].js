import golos from 'golos-lib-js';
import { Signature, hash, PublicKey, } from 'golos-lib-js/lib/auth/ecc';
import secureRandom from 'secure-random';
import nextConnect from '@/server/nextConnect';
import { authCors, } from '@/server/auth';
import { throwErr, } from '@/server/error';
import { checkOrigin, } from '@/server/origin';
import { initGolos, } from '@/server/initGolos';
import { rateLimitReq,
        noBodyParser, bodyString, bodyParams, } from '@/server/misc';
import Tarantool from '@/server/tarantool';

initGolos();

let challenges = new Map();
let sessions = new Map();

let handler = nextConnect({ attachParams: true, })
    .use(authCors())

    .get('/api', (req, res) => {
        res.json({
            status: 'ok',
            date: new Date(),
        });
    })

    .post('/api/csp_violation', async (req, res) => {
        rateLimitReq(req, {});

        let params = await bodyString(req);
        if (typeof(params) === 'string') try {
            params = JSON.parse(params);
        } catch (err) {}
        console.log('-- /csp_violation -->', req.headers['user-agent'], params);
        res.json({});
    })

    .post('/api/login_account', async (req, res) => {
        let params = await bodyParams(req);
        const { account, signatures, } = params;
        if (!account) {
            throwErr(req, 400, 'account is required');
        }

        let authSession = req.headers['x-auth-session'];

        let login_challenge = authSession && challenges.get(authSession);

        if (!signatures) { // step 1 or checking auth
            let originErr = checkOrigin(req);
            if (originErr) {
                throwErr(req, 400, originErr);
            }

            const alreadyAuthorized = sessions.get(authSession);

            if (!login_challenge) {
                authSession = secureRandom.randomBuffer(16).toString('hex')
                login_challenge = secureRandom.randomBuffer(16).toString('hex');
                challenges.set(authSession, login_challenge);
            }

            res.setHeader('X-Auth-Session', authSession)
                .json({
                    login_challenge,
                    already_authorized: alreadyAuthorized,
                    status: 'ok',
                });
        } else { // step 2
            if (!login_challenge) {
                throwErr(req, 400, 'no login_challenge in session');
            }

            const [ chainAccount, ] = await golos.api.getAccountsAsync([account]);
            if (!chainAccount) {
                throwErr(req, 400, 'missing blockchain account');
            }
            if (chainAccount.frozen) {
                throwErr(req, 400, 'account is frozen');
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
                throwErr(req, 400, 'wrong signatures');
            }

            challenges.delete(authSession);
            sessions.set(authSession, account);

            let data = {
                status: 'ok',
            };

            try {
                const result = await Tarantool.instance('tarantool').call('get_guid', account);
                const [ acc, guid, ] = result[0][0];
                data.guid = guid;
            } catch (e) {
                console.error('server auth: cannot obtain guid: ', e.message);
            }

            res.setHeader('X-Auth-Session', authSession)
                .json(data);
        }
    })

    .get('/api/logout_account', (req, res) => {
        const authSession = req.headers['x-auth-session'];
        const was_logged_in = sessions.delete(authSession);
        challenges.delete(authSession);
        res.json({
            status: 'ok',
            was_logged_in,
        });
    });

export default handler;

export {
    noBodyParser as config,
};
