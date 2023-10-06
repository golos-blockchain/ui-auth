import cors from 'cors'

export function cryptostoreCors(opts = {}) {
    return cors({
        origin: true,
        credentials: true,
        ...opts,
    })
}
