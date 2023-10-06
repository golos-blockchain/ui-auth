import cors from 'cors';

global._authSessions = global._authSessions || {}

export function authCors(opts = {}) {
    return cors({
        origin: true,
        credentials: true,
        exposedHeaders: ['X-Auth-Session'],
        ...opts,
    })
}

export function authSessions() {
    return global._authSessions
}
