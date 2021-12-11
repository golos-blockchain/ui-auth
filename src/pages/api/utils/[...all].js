import nc from 'next-connect';
import golos from 'golos-lib-js';
import config from 'config';
import { throwErr, onError, makeNoMatch, } from '@/server/error';
import { slowDownLimitReq, } from '@/server/misc';
import { initGolos, } from '@/server/initGolos';

initGolos();

let handler;

const onNoMatch = makeNoMatch(() => handler);

handler = nc({ onError, onNoMatch, attachParams: true, })

    .get('/api/utils/account_exists/:name', async (req, res) => {
        await slowDownLimitReq(req, 0.5, 1, 'account_exists');

        const { name, } = req.params;

        let accs = null;
        try {
            accs = await golos.api.getAccountsAsync([name]);
        } catch (err) {
            console.error(`/account_exists/${name}`, err);
            throwErr(req, 503, 'blockchain_unavailable', err);
        }

        res.json({
            status: 'ok',
            exists: (accs && accs.length > 0),
        });
    })

    .get('/api/utils/get_account/:name', async (req, res) => {
        await slowDownLimitReq(req, 0.5, 1, 'get_account');

        const { name, } = req.params;

        let accs = null;
        try {
            accs = await golos.api.getAccountsAsync([name]);
        } catch (err) {
            console.error(`/get_account/${name}`, err);
            throwErr(req, 503, 'blockchain_unavailable', err);
        }

        const account = (accs && accs.length > 0) ? accs[0] : null;

        res.json({
            status: 'ok',
            account,
        });
    })

    .get('/api/utils/get_invite/:public_key', async (req, res) => {
        await slowDownLimitReq(req, 0.5, 1, 'get_invite');

        const { public_key, } = req.params;

        let invite = null;
        try {
            invite = await golos.api.getInviteAsync(public_key);
        } catch (err) {
            if (err.toString().includes('Invalid parameter value')) {
                throwErr(req, 400, 'wrong_format');
            }
            console.error(`/get_invite/${public_key}`, err);
            throwErr(req, 503, 'blockchain_unavailable', err);
        }

        res.json({
            status: 'ok',
            invite,
        });
    })

export default handler;