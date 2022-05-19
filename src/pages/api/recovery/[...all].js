import golos, { auth, messages } from 'golos-lib-js'
import config from 'config'

import { checkCaptcha } from '@/server/captcha'
import { initGolos, } from '@/server/initGolos'
import nextConnect from '@/server/nextConnect'
import { throwErr, } from '@/server/error'
import { emailRegex, slowDownLimitReq, noBodyParser, bodyParams, } from '@/server/misc'
import { getHistoryAuthority } from '@/utils/RecoveryUtils'

initGolos()

const sendMessage = async (notifier_account, acc, recoveryAcc,email) => {
    let url = new URL('/recover/review/' + acc[0].name, config.get('recovery.rest_api'))
    let text = '@' + acc[0].name
    text += ' очень сильно просит вас помочь с восстановлением доступа к его аккаунту. Для этого проследуйте по ссылке '
    text += url.toString()
    text += ' Для связи пользователь указал e-mail ' + email

    let msg = messages.newTextMsg(text, 'golos-messenger', 1)

    let data = messages.encode(notifier_account.memo, recoveryAcc[0].memo_key, msg)

    const json = JSON.stringify(['private_message', {
        from: notifier_account.name,
        to: recoveryAcc[0].name,
        nonce: data.nonce,
        from_memo_key: auth.wifToPublic(notifier_account.memo),
        to_memo_key: recoveryAcc[0].memo_key,
        checksum: data.checksum,
        update: false,
        encrypted_message: data.encrypted_message,
    }])

    await golos.broadcast.customJsonAsync(notifier_account.posting, [], [notifier_account.name], 'private_message', json)
}

const afterSecToDate = (afterSec) => {
    if (afterSec && afterSec > 0) {
        let now = new Date()
        now.setSeconds(now.getSeconds() + afterSec)
        return now
    }
    return null
}

global.bandwidth = {
}

let handler = nextConnect({ attachParams: true, })

    .get('/api/recovery/request/:account', async (req, res) => {
        await slowDownLimitReq(req, 0.5, 1, 'get_recovery_request')

        const { account } = req.params

        let ri = null
        try {
            ri = await golos.api.getRecoveryInfoAsync({ accounts: [account] })
        } catch (err) {
            console.error(`/recovery/request/${name}`, err)
            throwErr(req, 503, 'blockchain_not_available', err)
        }

        ri = ri[account]

        if (!ri) {
            throwErr(req, 400, 'no_such_account')
        }

        let after_sec = 0

        const notifier_account = config.get('recovery.notifier_account')
        if (notifier_account.interval_sec) {
            const bandId = account +'/' + ri.recovery_account
            const now = Math.round(Date.now() / 1000)
            const lastSent = global.bandwidth[bandId]
            if (lastSent) {
                after_sec = Math.max(notifier_account.interval_sec - (now - lastSent.time), 0)
            }
        }

        res.json({
            status: 'ok',
            recovery_account: ri.recovery_account,
            recovery_request: ri.recovery_request,
            recovered_owner: ri.recovered_owner,
            owner_authority: ri.owner_authority,
            json_metadata: ri.json_metadata,
            next_owner_update_possible: ri.next_owner_update_possible,
            can_update_owner_now: ri.can_update_owner_now,
            can_retry: {
                after_sec,
                wait_until: afterSecToDate(after_sec)
            }
        })
    })

    .post('/api/recovery/request', async (req, res) => {
        await slowDownLimitReq(req, 0.5, 1, 'recovery_request')

        const { username, owner_public_key, email, recaptcha_v2 } = await bodyParams(req)

        if (!email || !email.match(emailRegex)) {
            throwErr(req, 400, 'wrong_email')
        }

        if (!checkCaptcha(recaptcha_v2, 'recovery.captcha')) {
            console.error('-- /recovery/request: try to recovery without ReCaptcha v2 solving, username:', username)
            throwErr(req, 403, ['recaptcha_v2_failed'])
        }

        let acc = null
        let recoveryAcc = null
        try {
            acc = await golos.api.getAccountsAsync([username])
            if (acc[0]) {
                recoveryAcc = await golos.api.getAccountsAsync([acc[0].recovery_account])
            }
        } catch (err) {
            console.error(`/recovery/${name}`, err)
            throwErr(req, 503, 'blockchain_not_available', err)
        }

        if (!acc[0]) {
            throwErr(req, 400, 'no_such_account')
        }

        if (!await getHistoryAuthority(acc[0].name, owner_public_key)) {
            throwErr(req, 400, 'cannot_find_owner_key_in_history')
        }

        const notifier_account = config.get('recovery.notifier_account')
        if (notifier_account.interval_sec) {
            const bandId = username +'/' +recoveryAcc[0].name
            const now = Math.round(Date.now() / 1000)
            const lastSent = global.bandwidth[bandId]
            if (lastSent && (now - lastSent.time) <= notifier_account.interval_sec) {
                throwErr(req, 429, 'too_many_requests')
            }
            global.bandwidth[bandId]  = {time: now}
        }

        await sendMessage(notifier_account, acc, recoveryAcc, email)

        const after_sec = notifier_account.interval_sec || 0

        res.json({
            status: 'ok',
            recovery_account: recoveryAcc[0].name,
            can_retry: {
                after_sec,
                wait_until: afterSecToDate(after_sec)
            }
        })
    })

export default handler

export {
    noBodyParser as config,
}
