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

function getRequiredPerms(ctx, opsToPerms, op, forEach) {
    let perms = opsToPerms[op[0]];
    if (!perms) {
        throw new Error('Operation ' + op[0] + ' is not supported by OAuth');
    }

    const acc = ctx.session && ctx.session.account;

    let required = [];
    for (let perm of perms) {
        const res = perm.cond(op[1], op[0]);
        if (res === false || res instanceof Error) {
            continue;
        }
        if (!res[1] || 
            !acc ||
            acc !== res[1]) {
            throw new Error('Missing authority for ' + op[0] + ' operation, authorized as ' + acc + ' but required ' + res[1]);
        }
        required.push(perm.perm);
        if (forEach && forEach(perm)) break;
    }

    return required;
}

function getMissingPerms(ctx, opsToPerms, clientName, op) {
    const client = ctx.session.clients[clientName];

    let allowed = false;
    let required = getRequiredPerms(ctx, opsToPerms, op,
        (perm) => {
            if (client.allowed.includes(perm.perm)) {
                allowed = true;
                return true;
            }
            return false;
        })

    return { allowed, required, };
}

module.exports = {
    getClientByOrigin,
    clientFromConfig,
    hasAuthority,
    getRequiredPerms,
    getMissingPerms,
}
