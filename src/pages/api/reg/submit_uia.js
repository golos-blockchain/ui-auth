import config from 'config'
import { api, broadcast, } from 'golos-lib-js'
import { Asset } from 'golos-lib-js/lib/utils'

import { checkCaptcha } from '@/server/captcha'
import nextConnect from '@/server/nextConnect';
import { throwErr, } from '@/server/error';
import { rateLimitReq,
        noBodyParser, bodyParams, } from '@/server/misc';
import { regSessionMiddleware, } from '@/server/regSession';

let handler = nextConnect()
    .use(regSessionMiddleware)

    .post('/api/reg/submit_uia', async (req, res) => {
        let state = {
            step: 'verified',
        };
    
        rateLimitReq(req, state);

        const { golos_received } = req.session
        if (!golos_received) {
            throwErr(req, 400, ['You have no golos_received in session'])
        }
        let fee
        try {
            fee = await Asset(golos_received)
        } catch (err) {
            throwErr(req, 400, ['Cannot parse golos_received'])
        }

        const cp = await api.getChainPropertiesAsync()
        const account_creation_fee = await Asset(cp.account_creation_fee)

        if (fee.lt(account_creation_fee)) {
            throwErr(req, 400, ['Your deposited is to low - ' + fee.toString() + ' when minimum fee is ' + account_creation_fee.toString()])
        }

        const account = await bodyParams(req)

        if (!checkCaptcha(account.recaptcha_v2)) {
            console.error('-- /submit: try to register without ReCaptcha v2 solving, data:', res.data, ', form fields:', account)
            throwErr(req, 403, ['recaptcha_v2_failed'], null, state)
        }

        const signingKey = config.get('registrar.signing_key')
        const operations = [['account_create', {
            fee: golos_received,
            creator: config.registrar.account,
            new_account_name: account.name,
            json_metadata: '{}',
            owner: {weight_threshold: 1, account_auths: [], key_auths: [[account.owner_key, 1]]},
            active: {weight_threshold: 1, account_auths: [], key_auths: [[account.active_key, 1]]},
            posting: {weight_threshold: 1, account_auths: [], key_auths: [[account.posting_key, 1]]},
            memo_key: account.memo_key
        }]]
        await broadcast.sendAsync({
            extensions: [],
            operations
        }, [signingKey])

        delete req.session.golos_received
        await req.session.save()

        state.status = 'ok';
        res.json({
            ...state,
        });
    })

export default handler

export {
    noBodyParser as config,
}
