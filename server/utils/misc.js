const tt = require('counterpart');
const emailRegex = /^([^\x00-\x20\x22\x28\x29\x2c\x2e\x3a-\x3c\x3e\x40\x5b-\x5d\x7f-\xff]+|\x22([^\x0d\x22\x5c\x80-\xff]|\x5c[\x00-\x7f])*\x22)(\x2e([^\x00-\x20\x22\x28\x29\x2c\x2e\x3a-\x3c\x3e\x40\x5b-\x5d\x7f-\xff]+|\x22([^\x0d\x22\x5c\x80-\xff]|\x5c[\x00-\x7f])*\x22))*\x40([^\x00-\x20\x22\x28\x29\x2c\x2e\x3a-\x3c\x3e\x40\x5b-\x5d\x7f-\xff]+|\x5b([^\x0d\x5b-\x5d\x80-\xff]|\x5c[\x00-\x7f])*\x5d)(\x2e([^\x00-\x20\x22\x28\x29\x2c\x2e\x3a-\x3c\x3e\x40\x5b-\x5d\x7f-\xff]+|\x5b([^\x0d\x5b-\x5d\x80-\xff]|\x5c[\x00-\x7f])*\x5d))*$/;

function bodyParams(ctx) {
    let params = ctx.request.body;
    if (typeof(params) === 'string') params = JSON.parse(params);
    return params;
}

function getRemoteIp(req) {
    const remote_address = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const ip_match = remote_address ? remote_address.match(/(\d+\.\d+\.\d+\.\d+)/) : null;
    return (ip_match ? ip_match[1] : remote_address) || '';
}

var ip_last_hit = new Map();
function rateLimitReq(ctx, req, errBodyProps = {}, limit, suffix) {
    limit = limit !== undefined ? limit : 1;
    let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const now = Date.now()

    if (suffix !== undefined) ip += suffix;
    // purge hits older than minutes_max
    ip_last_hit.forEach((v, k) => {
        const seconds = (now - v) / 1000;
        if (seconds > limit) {
            ip_last_hit.delete(ip)
        }
    })

    let result = false;
    // if ip is still in the map, abort
    if (ip_last_hit.has(ip)) {
        if (errBodyProps) {
            throwErr(ctx, 429, ['too_many_requests'], null, errBodyProps);
        }
        console.error(`Rate limit reached: one call per ${limit} second allowed.`);
        result = true;
    }

    // record api hit
    ip_last_hit.set(ip, now);
    return result;
}

async function slowDownLimitReq(ctx, req, limit, slowDown, suffix) {
    if (rateLimitReq(ctx, req, null, limit, suffix)) {
        await new Promise(resolve => setTimeout(resolve, slowDown*1000));
    }
}

function checkCSRF(ctx, csrf) {
    try { ctx.assertCSRF(csrf); } catch (e) {
        ctx.status = 403;
        ctx.body = 'invalid csrf token';
        console.log('-- invalid csrf token -->', ctx.request.method, ctx.request.url, ctx.session.uid);
        return false;
    }
    return true;
}

const throwErr = (ctx, status, message, exception, bodyProps) => {
    let msg = message;
    let messageStrData = undefined;
    if (Array.isArray(message)) {
        msg = message[0];
        messageStrData = message[1];
    }
    const locale = ctx.session ? ctx.session.locale : 'ru';
    ctx.throw(status, msg, {
        messageLocale: locale,
        messageStrData,
        exception: exception || undefined,
        bodyProps,
    });
};

const returnError = (ctx, error, errorException, errorStr, errorStrData = {}) => {
    if (ctx.status === 200 || ctx.status === 404) {
        ctx.status = 400;
    }
    const locale = ctx.session ? ctx.session.locale : 'ru';
    ctx.body = {
        status: 'err',
        error,
        error_str:
            (errorStr !== undefined) ?
            errorStr :
            tt('server_errors.' + error, {
                locale, ...errorStrData, }),
        error_exception: errorException
    };
};

function convertEntriesToArrays(obj) {
    return Object.keys(obj).reduce((result, key) => {
        result[key] = obj[key].split(/\s+/);
        return result;
    }, {});
}

module.exports = {
    bodyParams,
    emailRegex,
    getRemoteIp,
    rateLimitReq,
    slowDownLimitReq,
    checkCSRF,
    returnError,
    throwErr,
    convertEntriesToArrays,
};
