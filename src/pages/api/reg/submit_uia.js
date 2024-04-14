import config from 'config'
import { api, broadcast, } from 'golos-lib-js'
import { Asset } from 'golos-lib-js/lib/utils'

import { checkCaptcha } from '@/server/captcha'
import nextConnect from '@/server/nextConnect';
import { throwErr, } from '@/server/error';
import { rateLimitReq,
        noBodyParser, bodyParams, } from '@/server/misc';
import { sendMsgAsync } from '@/server/messages'
import { useReachedWait, clearWait, } from '@/server/reg'
import { regSessionMiddleware, } from '@/server/regSession';

async function messageOrLogWait(wait, accName) {
    try {
        const from = config.get('notifier_account.name')
        const posting = config.get('notifier_account.posting')
        const memo = config.get('notifier_account.memo')

        let msg = 'Пользователь, зарегистрировавшийся под ником @' + accName
        msg += ', не смог получить ' + wait.amount.floatString + ' в Силу Голоса.'
        await sendMsgAsync({
            msg,
            encode: {
                from_key: memo,
                to: config.get('registrar.account'),
            },
            op: {
                from,
                posting: posting
            }
        })
    } catch (err) {
        console.error('UIA Register:', 'Cannot sent notify message about problem UIA reg:', err, accName, wait.amount.floatString)
    }
    console.log('UIA Register:', 'Sent message about problem UIA reg:', accName, wait.amount.floatString)
}

let handler = nextConnect()
    .use(regSessionMiddleware)

    .post('/api/reg/submit_uia', async (req, res) => {
        let state = {
            step: 'verified',
        };
    
        rateLimitReq(req, state);

        const account = await bodyParams(req)

        const { golos_received } = req.session
        let wait
        if (!golos_received) {
            wait = await useReachedWait(req.session)
            if (!wait.reached) {
                throwErr(req, 400, ['You have no golos_received in session, and wait result is ' + wait.err])
            }

            await messageOrLogWait(wait, account.name)
        }

        const cp = await api.getChainPropertiesAsync()
        let fee
        if (golos_received) {
            try {
                fee = await Asset(golos_received)
            } catch (err) {
                throwErr(req, 400, ['Cannot parse golos_received'])
            }
        } else {
            if (config.has('registrar.fee')) {
                fee = await Asset(config.get('registrar.fee'))
            } else {
                fee = await Asset(cp.create_account_min_golos_fee)
                if (config.has('registrar.add_to_fee')) {
                    fee = fee.plus(await Asset(config.get('registrar.add_to_fee')))
                }
            }
        }

        const account_creation_fee = await Asset(cp.account_creation_fee)

        if (fee.lt(account_creation_fee)) {
            throwErr(req, 400, ['Your deposited is too low - ' + fee.toString() + ' when minimum fee is ' + account_creation_fee.toString()])
        }

        if (!await checkCaptcha(account.recaptcha_v2)) {
            console.error('-- /submit: try to register without ReCaptcha v2 solving, data:', res.data, ', form fields:', account)
            throwErr(req, 403, ['recaptcha_v2_failed'], null, state)
        }

        const signingKey = config.get('registrar.signing_key')
        const operations = [['account_create', {
            fee: fee.toString(),
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

        if (golos_received) {
            delete req.session.golos_received
        }
        if (wait) {
            await clearWait(req.session, false)
        }
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
