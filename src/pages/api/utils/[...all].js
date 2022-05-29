import golos from 'golos-lib-js'
import { Asset, } from 'golos-lib-js/lib/utils'
import config from 'config';

import nextConnect from '@/server/nextConnect';
import { throwErr, } from '@/server/error';
import { slowDownLimitReq, } from '@/server/misc';
import { initGolos, } from '@/server/initGolos';

initGolos();

const getAddToFee = async () => {
    const addToFee = config.has('registrar.add_to_fee') ?
        config.get('registrar.add_to_fee') : '1.000 GOLOS'
    return await Asset(addToFee)
}

let handler = nextConnect({ attachParams: true, })

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

        let accWillReceive = null

        if (invite) {
            let balance = await Asset(invite.balance)
            if (balance.symbol !== 'GOLOS') {
                throwErr(req, 400, 'wrong_invite_asset_symbol');
            }

            let props = null
            try {
                props = await golos.api.getChainPropertiesAsync()
            } catch (err) {
                console.error(`/chain_props`, err)
                throwErr(req, 503, 'blockchain_unavailable', err)
            }

            const min_invite_balance = Asset(props.min_invite_balance)
            if (balance.lt(min_invite_balance)) {
                const required = (await getAddToFee()).plus(min_invite_balance)
                throwErr(req, 400, ['too_low_invite_balance', {
                    REQUIRED: required.floatString,
                    PROVIDED: balance.floatString
                }])
            }

            accWillReceive = balance.minus(min_invite_balance)
        }

        res.json({
            status: 'ok',
            invite,
            account_will_receive: accWillReceive.toString(),
            account_will_receive_str: accWillReceive ? accWillReceive.floatString : null
        });
    })

    // Experimental, can change in future
    .get('/api/utils/chain_props', async (req, res) => {
        await slowDownLimitReq(req, 0.5, 1, 'chain_props');

        let props = null
        try {
            props = await golos.api.getChainPropertiesAsync()
        } catch (err) {
            console.error(`/chain_props`, err);
            throwErr(req, 503, 'blockchain_unavailable', err);
        }

        let min_transfer = await Asset(props.account_creation_fee)

        const addToFee = await getAddToFee()

        min_transfer = min_transfer.plus(addToFee)

        res.json({
            status: 'ok',
            props,
            min_transfer: min_transfer.toString(),
            min_transfer_str: min_transfer.floatString,
        });
    })

export default handler;