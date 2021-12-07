import cors from 'cors';

export function authCors(opts = {}) {
    return cors({
        origin: true,
        credentials: true,
        exposeHeaders: ['X-Auth-Session'],
        ...opts,
    })
}
