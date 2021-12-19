import nc from 'next-connect';
import { onError, makeNoMatch, } from '@/server/error';
import { securityMiddleware, } from '@/server/security';

export default function nextConnect(opts = {}) {
    let handler;

    const onNoMatch = makeNoMatch(() => handler);

    handler = nc({ onError, onNoMatch, ...opts, });
    handler = handler.use(securityMiddleware);
    return handler;
}
