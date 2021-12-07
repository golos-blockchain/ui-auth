import tt from 'counterpart';

class ServerError extends Error {
    constructor(message, status) {
        super(message);
        this.status = status || 500;
        this.name = 'ServerError';
    }
}

export const throwErr = (req, status, message, exception, bodyProps) => {
    let msg = message;
    let msgStrData = undefined;
    if (Array.isArray(message)) {
        msg = message[0];
        msgStrData = message[1];
    }
    let err = new ServerError(msg, status);
    err.msgLocale = (req.session && req.session.locale) || 'ru';
    err.msgStrData = msgStrData;
    err.exception = exception || undefined;
    err.bodyProps = bodyProps;
    throw err;
};

const returnError = (res, err) => {
    const httpStatus = err.status || 500;
    let body = {
        status: 'err',
        httpStatus,
        error: err.message,
        error_str: tt('server_errors.' + err.message, {
            locale: err.msgLocale,
            ...err.msgStrData,
        }),
        error_exception: err.exception ? {
            message: err.exception.message,
            ...err.exception,
        } : undefined,
        ...err.bodyProps,
    };
    res.status(httpStatus).json(body);
};

const logError = (err, req) => {
    let userAgent = 'unknown';
    let origin = 'unknown';
    try { userAgent = req.headers['user-agent']; } catch {}
    try { origin = req.headers['origin']; } catch {}
    console.error('ERROR IN', req.url, '\n',
        err, '\n',
        '\n',
        'Client who caused error:\n',
        'User-Agent', userAgent, '\n',
        'Origin', origin);
};

export const onError = (err, req, res) => {
    logError(err, req);
    try {
        returnError(res, err);
    } catch (err2) {
        console.error('Error occured during error handling', err2);
        const httpStatus = 500;
        res.status(httpStatus).json({
            status: 'err',
            httpStatus,
            error: 'unknown_error',
            error_str: 'Unknown error, try again later',
        });
    }
};

const onNoMatch = async (req, res, nc) => {
    let httpStatus = 404;
    let error = 'Not Found';
    try {
        if (nc) for (let route of nc.routes) {
            if (route.method.length > 0 && req.url.match(route.pattern)) {
                httpStatus = 405;
                error = 'Method Not Allowed';
                break;
            }
        }
    } catch (error) { // nc.routes is undocumented so it can break...
        console.error('ERROR: nc.routes trick breaked', error);
    }
    res.status(httpStatus);
    res.json({
        status: 'err',
        httpStatus,
        error,
        error_str: tt('server_errors.' + error),
    });
    logError(error, req);
};

export const makeNoMatch = (handlerGetter) => {
    return async function(req, res) {
        await onNoMatch(req, res, handlerGetter && handlerGetter());
    };
};
