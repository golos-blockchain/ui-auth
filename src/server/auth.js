import cors from 'cors';

export function authCors(opts = {}) {
    return cors({
        origin: true,
        credentials: true,
        exposedHeaders: ['X-Auth-Session'],
        ...opts,
    })
}
