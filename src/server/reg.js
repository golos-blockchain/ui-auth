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
        cfg.grants[key] = {
            enabled: val.enabled,
        };
    }

    cfg.fake_emails_allowed = config.has('fake_emails_allowed')
        && config.get('fake_emails_allowed');

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
