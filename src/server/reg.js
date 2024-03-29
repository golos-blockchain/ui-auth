import config from 'config';
import secureRandom from 'secure-random';
import { getVersion, } from '@/server/misc';

function checkSession(session, funcName) {
    if (!session)
        throw new Error('You should set regSession before call ' + funcName);
}

// requires session commit after call
export function obtainUid(req) {
    const { session, } = req;
    checkSession(session, 'getUid');
    const last_visit = session.last_visit;
    session.last_visit = new Date().getTime() / 1000 | 0;
    if (!session.uid) {
        session.uid = secureRandom.randomBuffer(13).toString('hex');
        session.new_visit = true;
    } else {
        session.new_visit = session.last_visit - last_visit > 1800;
    }
    return session.uid;
}

export function getDailyLimit() {
    const now = Date.now()
    if (config.has('registrar.free_regs_per_day')) {
        const per_day = parseInt(config.get('registrar.free_regs_per_day'))
        const dailyLimit = global.dailyLimit
        let regs = []
        if (dailyLimit) {
            let toShift = 0
            for (const reg of dailyLimit.regs) {
                if ((now - reg) >= 1000*60*60*24) {
                    ++toShift
                } else {
                    break
                }
            }
            regs = dailyLimit.regs.slice(toShift)
        }
        let first = regs[0] || now
        const exceed = regs.length >= per_day
        return {
            limit: {
                regs,
                first,
                exceed,
                per_day
            },
            now
        }
    }
    return { limit: null, now }
}

export function useDailyLimit() {
    const { limit, now } = getDailyLimit()
    if (!limit) return true
    if (limit.exceed) return false
    global.dailyLimit = {
        regs: limit.regs || [],
        first: limit.first
    }
    global.dailyLimit.regs.push(now)
    return true
}

export function getClientCfg(req, params, locale = '') {
    const { session, } = req;
    checkSession(session, 'getClientCfg');
    let localeAlreadySet = null;
    if (locale) {
        localeAlreadySet = false;
        if (locale === 'ru' || locale === 'en') {
            if (req.session.locale === locale) {
                localeAlreadySet = true;
            }
            req.session.locale = locale;
        }
    }

    let cfg = {};

    cfg.ws_connection_client = config.get('ws_connection_client')
    if (config.has('chain_id'))
        cfg.chain_id = config.get('chain_id')

    cfg.captcha = {};
    let captcha = config.get('captcha');
    if (captcha) {
        let recaptcha_v2 = captcha.get('recaptcha_v2');
        if (recaptcha_v2) {
            cfg.captcha['recaptcha_v2'] = {};
            cfg.captcha['recaptcha_v2'].enabled = recaptcha_v2.get('enabled');
            if (recaptcha_v2.get('enabled')) {
                cfg.captcha['recaptcha_v2'].site_key = recaptcha_v2.get('site_key');

                if (!cfg.captcha['recaptcha_v2'].site_key) {
                    console.error('Captcha ERROR: recaptcha_v2 has wrong site_key in config!');
                }
            } else {
                console.error('Captcha ERROR: recaptcha_v2 is disabled in config!');
            }
        } else {
            console.error('Captcha ERROR: recaptcha_v2 is absent in config!');
        }
    } else {
        console.error('Captcha ERROR: captcha is absent in config!');
    }

    let client = config.get('default_client');
    let clientParam = params && params.client;
    if (clientParam) {
        if (Array.isArray(clientParam))
            clientParam = clientParam[0];
        if (config.get('clients').has(clientParam)) {
            client = clientParam;
        } else {
            console.error('Cannot get config for client ' + clientParam);
        }
    }

    cfg.client = {};
    const clientParams = config.get('clients').get(client);
    cfg.client.id = client;
    cfg.client.locale =
        clientParams.has('default_locale') ?
        clientParams.get('default_locale') : 'ru';
    cfg.client = {...cfg.client, ...clientParams};

    cfg.grants = {};
    const grant = config.get('grant') || {};
    for (const [key, val] of Object.entries(grant)) {
        const obj = {
            enabled: val.enabled,
        }
        if (key === 'telegram') {
            obj.bot_name = val.bot_name
        }
        cfg.grants[key] = obj
    }

    cfg.fake_emails_allowed = config.has('fake_emails_allowed')
        && config.get('fake_emails_allowed');

    cfg.registrar = config.has('registrar') ? config.get('registrar') : {}
    const { registrar } = cfg
    if (!registrar.uias) registrar.uias = {}
    if (!registrar.uias.assets) registrar.uias.assets = []
    for (const sym of registrar.uias.assets) {
        if (!registrar.uias[sym]) registrar.uias[sym] = [sym + '/GOLOS']
    }

    cfg.apidex_service = config.has('apidex_service')
        && config.get('apidex_service')

    let data = {
        config: cfg,
        oauthEnabled: config.has('oauth'),
        version: getVersion(),
    };

    if (localeAlreadySet !== null) {
        data.locale_was_already_set = localeAlreadySet;
    }

    return data;
}
