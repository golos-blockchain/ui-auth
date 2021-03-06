import { buffer, } from 'micro';
import git from 'git-rev-sync';
import { throwErr, } from '@/server/error';

const emailRegex = /^([^\x00-\x20\x22\x28\x29\x2c\x2e\x3a-\x3c\x3e\x40\x5b-\x5d\x7f-\xff]+|\x22([^\x0d\x22\x5c\x80-\xff]|\x5c[\x00-\x7f])*\x22)(\x2e([^\x00-\x20\x22\x28\x29\x2c\x2e\x3a-\x3c\x3e\x40\x5b-\x5d\x7f-\xff]+|\x22([^\x0d\x22\x5c\x80-\xff]|\x5c[\x00-\x7f])*\x22))*\x40([^\x00-\x20\x22\x28\x29\x2c\x2e\x3a-\x3c\x3e\x40\x5b-\x5d\x7f-\xff]+|\x5b([^\x0d\x5b-\x5d\x80-\xff]|\x5c[\x00-\x7f])*\x5d)(\x2e([^\x00-\x20\x22\x28\x29\x2c\x2e\x3a-\x3c\x3e\x40\x5b-\x5d\x7f-\xff]+|\x5b([^\x0d\x5b-\x5d\x80-\xff]|\x5c[\x00-\x7f])*\x5d))*$/;

function getVersion() {
    try {
        return git.short('.');
    } catch (err) {
        console.error('Cannot obtain .git version:', err);
        return 'dev';
    }
}

const noBodyParser = {
    api: {
        bodyParser: false,
    },
};

async function bodyString(req) {
    return (await buffer(req)).toString();
}

async function bodyParams(req, throwInvalidJSON = true) {
    let params = await bodyString(req);
    try {
        params = JSON.parse(params);
    } catch (err) {
        if (throwInvalidJSON)
            throwErr(req, 400, err.message, err);
        params = {};
    }
    return params;
}

function getRemoteIp(req) {
    const remote_address = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const ip_match = remote_address ? remote_address.match(/(\d+\.\d+\.\d+\.\d+)/) : null;
    return (ip_match ? ip_match[1] : remote_address) || '';
}

var ip_last_hit = new Map();
function rateLimitReq(req, errBodyProps = {}, limit, suffix) {
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
            throwErr(req, 429, ['too_many_requests'], null, errBodyProps);
        }
        console.error(`Rate limit reached: one call per ${limit} second allowed.`);
        result = true;
    }

    // record api hit
    ip_last_hit.set(ip, now);
    return result;
}

async function slowDownLimitReq(req, limit, slowDown, suffix) {
    if (rateLimitReq(req, null, limit, suffix)) {
        await new Promise(resolve => setTimeout(resolve, slowDown*1000));
    }
}

function redirect(url, status = false) {
    let redir = {
        destination: url,
    };
    if (status) {
        if (status === true) {
            redir.permanent = true;
        } else {
            redir.statusCode = status;
        }
    } else {
        redir.permanent = false;
    }
    const ret = {
        redirect: redir,
    };
    return ret;
}

module.exports = {
    getVersion,
    noBodyParser,
    bodyString,
    bodyParams,
    emailRegex,
    getRemoteIp,
    rateLimitReq,
    slowDownLimitReq,
    redirect,
};
