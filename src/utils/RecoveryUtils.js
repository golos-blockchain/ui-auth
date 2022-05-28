import golos from 'golos-lib-js'
import { PrivateKey } from 'golos-lib-js/lib/auth/ecc'

export async function callApi(apiName, data) {
    let request = {
        method: data ? 'post' : 'get',
        credentials: 'include',
        headers: {
            Accept: 'application/json',
            'Content-type': data ? 'application/json' : undefined,
        },
        body: data ? JSON.stringify(data) : undefined,
    }
    let res = await fetch(apiName, request)
    return res;
}

export function wifToPublic(wifOrPrivateKey) {
    const wif = wifOrPrivateKey.toString()
    return golos.auth.wifToPublic(wif)
}

export const emptyAuthority = (key) => {
    let pub = wifToPublic(key)
    return {weight_threshold: 1, account_auths: [], key_auths: [[pub, 1]]}
}

export const authorityToKey = (authority) => {
    if (!authority) throw new Error('No authority')
    let { key_auths } = authority
    let ka = authority.key_auths[0]
    if (!ka || !ka[0]) throw new Error('Authority has empty key auths')
    if (ka[1] !== 1) throw new Error('Wrong authority key auth weight')
    return ka[0]
}

export const parseKey = (username, password, role) => {
    if (password.startsWith('P')) {
        PrivateKey.fromWif(password.substring(1)) // validates
        return PrivateKey.fromSeed(`${username}${role}${password}`)
    } else {
        return PrivateKey.fromWif(password)
    }
}

export async function getHistoryAuthority(username, pubKey) {
    let roa = null
    const history = await golos.api.getOwnerHistoryAsync(username)
    for (let rec of history) {
        const { previous_owner_authority } = rec
        const { key_auths } = previous_owner_authority
        let key = key_auths.filter(ka => ka[0] === pubKey)
        if (key.length) {
            roa = previous_owner_authority
            return roa
        }
    }
    console.error('getHistoryAuthority cannot found', history)
    return roa
}

export const STEPS = {
    EnterName: 1,
    NotifyingPartner: 2,
    WaitingOwnerReset: 3,
    OwnerReset: 4,
    WaitingFinalReset: 5,
    FinalReset: 6
}
