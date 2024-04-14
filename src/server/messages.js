import { auth, api, broadcast, messages } from 'golos-lib-js'
import isFunction from 'lodash/isFunction'

// msg/message: 
// - function which returns message created by newTextMsg/newImageMsg/etc
// - - or array of such messages
// - - or string (text message)
// - or just string (text message)
export async function sendMsgAsync(params) {
    if (!params) throw new Error('params required')

    let { msg, message, encode, op, operation } = params

    msg = msg || message
    if (!msg) throw new Error('`msg` or `message` param requred')

    if (isFunction(msg)) {
        msg = await msg()
    } else {
        msg = messages.newTextMsg(msg, 'golos-messenger', 1)
    }

    let data, from_memo_key, to_acc, to_memo_key
    if (encode !== false && !encode) {
        throw new Error('For security reasons, you should define `encode` param as a function or `false` if you want unencrypted message.')
    }
    if (encode) {
        if (isFunction(encode)) {
            encode = await encode()
        }
        let { from_key, to } = encode
        if (!from_key) throw new Error('`encode.from_key` is required - private memo key of sender.')
        if (!to) throw new Error('`encode.to` is required - public memo key of receiver or their account name.')
        if (!auth.isPubkey(to)) {
            to_acc = to
            const accs = await api.getAccounts([to])
            if (!accs[0]) throw new Error('`encode.to` - no such account')
            to = accs[0].memo_key
        }
        from_memo_key = auth.wifToPublic(from_key)
        to_memo_key = to
        data = messages.encode(from_key, to, msg)
    } else {
        data = JSON.stringify(msg)
    }

    operation = operation || op
    if (!operation) {
        return data
    }
    if (isFunction(operation)) {
        operation = await operation()
    }
    let { from, posting } = operation
    if (!from) throw new Error('`operation.from` is required - account name of message sender.')
    if (!posting || !auth.isWif(posting)) throw new Error('`operation.posting` is required and should be valid private posting key of message sender.')
    if (!to_acc) {
        to_acc = operation.to
        if (!to_acc) throw new Error('`operation.to` is required - account name of message receiver.')
    }

    const json = JSON.stringify(['private_message', {
        from: from,
        to: to_acc,
        nonce: data.nonce || 0,
        from_memo_key,
        to_memo_key,
        checksum: data.checksum || 0,
        update: false,
        encrypted_message: data.encrypted_message || data,
    }])

    return await broadcast.customJsonAsync(posting, [], [from], 'private_message', json)
}