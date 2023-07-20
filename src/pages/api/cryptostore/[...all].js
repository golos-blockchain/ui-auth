import secureRandom from 'secure-random';
import crypto from 'browserify-aes'
import golos, { api } from 'golos-lib-js';
import { validateAccountName } from 'golos-lib-js/lib/utils'
import { hash } from 'golos-lib-js/lib/auth/ecc'

import config from 'config';

import nextConnect from '@/server/nextConnect';
import { authSessions } from '@/server/auth'
import { cryptostoreCors } from '@/server/cryptostore'
import { throwErr, } from '@/server/error';
import { initGolos, } from '@/server/initGolos';
import { noBodyParser, bodyParams, } from '@/server/misc';
import { checkOrigin, } from '@/server/origin'
import Tarantool from '@/server/tarantool'

let handler = nextConnect({ attachParams: true, })
    .use(cryptostoreCors())

async function getKey(account) {
    let rec
    try {
        rec = await Tarantool.instance('tarantool').call('cryptostore_get', account)
        return rec[0][2]
    } catch (e) {
        console.error('cryptostore: cannot get stored key:', e);
    }
    return null
}

async function encrypt(req, res, xauthsession) {
    const account = authSessions()[xauthsession]

    if (!account) {
        throwErr(req, 400, 'not authorized with /api/login_account')
    }

    let generated = false

    let key = await getKey(account)
    if (!key) {
        key = secureRandom.randomBuffer(16).toString('hex')

        try {
            await Tarantool.instance('tarantool').call('cryptostore_insert', account, key)
        } catch (e) {
            console.error('server auth: cannot insert key:', e);
        }
        generated = true
    }

    res.json({
        status: 'ok',
        account,
        key,
        generated
    });
}

function validateOid(req, oid) {
    if (!oid) throwErr(req, 400, 'oid is missing')

    const errApp = validateAccountName(oid.app)
    if (errApp.error) throwErr(req, 400, 'oid.app: ' + errApp.error)

    const errName = validateAccountName(oid.name)
    if (errName.error) throwErr(req, 400, 'oid.name: ' + errName.error)

    if (!oid.version || !Number.isInteger(oid.version)) throwErr(req, oid, 'oid.version: should be int >= 1, <= 65535')
}

async function decrypt(req, res, xauthsession) {
    const params = await bodyParams(req)
    const { entries, oid, } = params

    const account = authSessions()[xauthsession]

    if (!account) {
        const result = entries.map(entry => {
            return {
                author: entry.author,
                err: 'no_auth'
            }
        })
        res.json({
            status: 'ok',
            result,
        })
        return
    }

    const authors = new Set()
    const inactiveAuthors = new Map()
    const query = {
        subscriber: account,
        select_items: [],
        select_oid: oid,
        limit: 100
    }
    for (const entry of entries) {
        const { author, } = entry

        if (account !== author) {
            query.select_items.push([author])
        }
    }
    let subs
    do {
        try {
            subs = await api.getPaidSubscriptionsAsync(query)
        } catch (err) {
            console.error('/api/cryptostore/decrypt:', err)
            throw err
        }
        for (const obj of subs) {
            if (obj.active) {
                authors.add(obj.author)
            } else {
                inactiveAuthors.add(obj.author, {
                    cost: obj.cost,
                    tip_cost: obj.tip_cost,
                })
            }

            query.start_author = obj.author
            query.start_oid = oid
        }
    } while (subs.length >= 100)

    const pso = {}
    const keys = {}
    const result = []
    for (const entry of entries) {
        const { author, body } = entry

        if (account !== author && !authors.has(author)) {
            let sub = inactiveAuthors.get(author)
            if (sub) {
                result.push({ author, err: 'inactive', sub })
                continue
            }

            const opts = pso[author] || await api.getPaidSubscriptionOptionsAsync({
                author, oid,
            })
            pso[author] = opts
            if (opts.author) {
                result.push({ author, err: 'no_sponsor', sub: {
                    cost: opts.cost,
                    tip_cost: opts.tip_cost
                }})
            } else {
                result.push({ author, err: 'no_sub' })
            }
            continue
        }

        let key = keys[author] || await getKey(author)
        keys[author] = key

        if (!key) {
            result.push({ author, err: 'no_key' })
        } else {
            try {
                const buff = new Buffer(entry.body, 'base64')
                const keySha = hash.sha512(key)
                const cKey = keySha.slice(0, 32)
                const iv = keySha.slice(32, 48)
                const decipher = crypto.createDecipheriv('aes-256-cbc', cKey, iv)
                const msg = Buffer.concat([decipher.update(buff), decipher.final()])
                const body = new TextDecoder('utf-8', { fatal: true }).decode(msg)
                result.push({ author, body })
            } catch (err) {
                console.error('cryptostore - Cannot decrypt:', err)
                result.push({ author, err: 'cannot_decrypt' })
            }
        }
    }

    res.json({
        status: 'ok',
        result,
    });
}

handler =

handler.get('/api/cryptostore/encrypt/:xauthsession', async (req, res) => {
    const { xauthsession, } = req.params
    if (!xauthsession) {
        throwErr(req, 400, 'xauthsession should not be empty')
    }

    await encrypt(req, res, xauthsession)
})

handler.post('/api/cryptostore/encrypt', async (req, res) => {
    const authSession = req.headers['x-auth-session']
    if (!authSession) {
        throwErr(req, 400, 'x-auth-session header is required');
    }

    const originErr = checkOrigin(req)
    if (originErr) {
        throwErr(req, 400, originErr)
    }

    await encrypt(req, res, authSession)
})

.post('/api/cryptostore/decrypt', async (req, res) => {
    const authSession = req.headers['x-auth-session']
    if (!authSession) {
        throwErr(req, 400, 'x-auth-session header is required');
    }

    const originErr = checkOrigin(req)
    if (originErr) {
        throwErr(req, 400, originErr)
    }

    await decrypt(req, res, authSession)
})

export default handler

export {
    noBodyParser as config,
}
