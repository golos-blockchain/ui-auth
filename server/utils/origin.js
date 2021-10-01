const config = require('config');
const { throwErr, } = require('./misc');

let allowedClients = config.get('allowed_clients') || '';

const checkOrigin = (ctx) => {
    if (!allowedClients.length) {
        console.error(`allowed_clients in config not set, service is unavailable`);

        return `allowed_clients in config not set, service is unavailable`;
    }
    let origin = ctx.get('origin');
    if (!origin) {
        console.warn(`Request without origin! User-Agent: ${ctx.get('user-agent')}`);

        return 'Origin header required';
    }
    let originHost = null;
    try {
        originHost = new URL(origin);
    } catch (err) {
        console.warn(`Wrong origin! User-Agent: ${ctx.get('user-agent')}, Origin: ${origin}`);

        return 'Origin cannot be parsed: ' + origin;
    }
    originHost = originHost.hostname;
    if (!originHost) {
        console.warn(`Wrong origin! User-Agent: ${ctx.get('user-agent')}, Origin: ${origin}`);

        return 'Origin is wrong: ' + origin;
    }
    if (!allowedClients.includes(originHost))  {
        console.error(`Origin forbidden, Origin: ${originHost}, Allowed: ${JSON.stringify(allowedClients)}, User-Agent: ${ctx.get('user-agent')}`)

        return 'Auth service doesn\'t trust your client and not allows your Origin to use service';
    }
    return null;
};

const getOrigin = (ctx) => {
    let originHost = ctx.get('origin');
    if (originHost === 'null' || !originHost) {
        return originHost;
    }
    try {
        originHost = new URL(originHost);
    } catch (err) {
        throw new Error('Origin cannot be parsed: ' + originHost);
    }
    originHost = originHost.hostname;
    if (!originHost) {
        throw new Error('Origin is wrong: ' + originHost);
    }
    return originHost;
};

const checkCrossOrigin = (ctx) => {
    let originHost = null;
    try {
        originHost = getOrigin(ctx);
    } catch (err) {
        return err.message;
    }
    if (!originHost) {
        return null;
    }
    let ownHost = null;
    try {
        ownHost = new URL(config.get('oauth.rest_api')).hostname;
    } catch (err) {
        console.error('oauth.rest_api cannot be parsed as URL');
        return 'oauth.rest_api cannot be parsed as URL';
    }
    const same = ownHost === originHost;
    if (same) {
        return false;
    }
    return ownHost + ' !== ' + originHost;
};

const forbidCorsOnProd = (ctx) => {
    if (process.env.NODE_ENV !== 'production') {
        return;
    }
    let originErr = checkCrossOrigin(ctx);
    if (originErr)
        throwErr(ctx, 403, [originErr]);
}

module.exports = {
    checkOrigin,
    getOrigin,
    checkCrossOrigin,
    forbidCorsOnProd,
};
