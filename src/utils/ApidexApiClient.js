import { fetchEx, Asset } from 'golos-lib-js/lib/utils'

const request_base = {
    timeout: 2000,
    method: 'get',
    headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
    }
}

const pageBaseURL = 'https://coinmarketcap.com/currencies/'

const getPageURL = (slug) => {
    return new URL(slug + '/', pageBaseURL).toString()
}

export const apidexUrl = (apidex_service, pathname) => {
    try {
        return new URL(pathname, apidex_service.host).toString();
    } catch (err) {
        console.error('apidexUrl', err)
        return ''
    }
}

let cached = {}

export async function apidexGetPrices(apidex_service, sym) {
    const empty = {
        price_usd: null,
        price_rub: null,
        page_url: null
    }
    if (!apidex_service || !apidex_service.host) return empty
    let request = Object.assign({}, request_base)
    try {
        const now = new Date()
        const cache = cached[sym]
        if (cache && (now - cache.time) < 60000) {
            return cache.resp
        } else {
            let resp = await fetchEx(apidexUrl(apidex_service, `/api/v1/cmc/${sym}`), request)
            resp = await resp.json()
            if (resp.data && resp.data.slug)
                resp['page_url'] = getPageURL(resp.data.slug)
            else
                resp['page_url'] = null
            cached[sym] = {
                resp, time: now
            }
            return resp
        }
    } catch (err) {
        console.error('apidexGetPrices', err)
        return empty
    }
}

let cachedAll = {}

export async function apidexGetAll(apidex_service) {
    const empty = {
        data: {}
    }
    if (!apidex_service || !apidex_service.host) return empty
    let request = Object.assign({}, request_base)
    try {
        const now = new Date()
        if (cachedAll && (now - cachedAll.time) < 60000) {
            return cachedAll.resp
        } else {
            let resp = await fetchEx(apidexUrl(apidex_service, `/api/v1/cmc`), request)
            resp = await resp.json()
            cachedAll = {
                resp, time: now
            }
            return resp
        }
    } catch (err) {
        console.error('apidexGetAll', err)
        return empty
    }
}

export async function apidexExchange(apidex_service, sell, buySym) {
    if (!apidex_service || !apidex_service.host) return empty
    let request = Object.assign({}, request_base)
    try {
        let resp = await fetchEx(apidexUrl(apidex_service, `/api/v1/exchange/` + sell.toString() + '/' + buySym), request)
        resp = await resp.json()
        return await Asset(resp.result)
    } catch (err) {
        console.error('apidexExchange', err)
        return null
    }
}
