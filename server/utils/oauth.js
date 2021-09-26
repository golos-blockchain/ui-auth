const config = require('config');

const { getOrigin, } = require('./origin');

function getClientByOrigin(ctx) {
    let originFound = null;
    const origin = getOrigin(ctx);
    if (ctx.session.clients) {
        for (const client in ctx.session.clients) {
            let cfgClient = 'oauth.allowed_clients.' + client;
            if (!config.has(cfgClient))
                continue;
            cfgClient = config.get(cfgClient);
            if (cfgClient.origins && cfgClient.origins.includes(origin)) {
                originFound = client;
                break;
            }
        }
    }
    if (!originFound) {
        throw new Error(`Origin '${origin}' is not allowed, authorize please`);
    }
    return originFound;
}

function clientFromConfig(client, locale) {
    const cfgKey = 'oauth.allowed_clients.' + client;
    const clientCfg = config.has(cfgKey) && config.get(cfgKey);

    let clientMeta = null;
    if (clientCfg) {
        clientMeta = {};
        clientMeta.logo = '/oauth_clients/' + clientCfg.logo;
        let loc = 'ru';
        if (locale && clientCfg[locale])
            loc = locale;
        if (!clientCfg[loc])
            loc = 'en';
        clientMeta.title = clientCfg[loc].title;
        clientMeta.description = clientCfg[loc].description;
    }
    return clientMeta;
};

function hasAuthority(acc, serviceAccountName) {
    if (!acc)
        return false;
    if (!acc.active || !acc.active.account_auths)
        return false;
    if (!acc.posting || !acc.posting.account_auths)
        return false;
    const hasActive = acc.active.account_auths.find(auth => {
        return auth[1] === 1 && auth[0] === serviceAccountName;
    });
    const hasPosting = acc.posting.account_auths.find(auth => {
        return auth[1] === 1 && auth[0] === serviceAccountName;
    });
    return hasActive && hasPosting;
}

module.exports = {
    getClientByOrigin,
    clientFromConfig,
    hasAuthority,
}
