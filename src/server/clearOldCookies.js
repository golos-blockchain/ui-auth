import { cookieName as oauthCookieName, } from '@/server/oauthSession';
import { cookieName as regCookieName, } from '@/server/regSession';

// Created 2021-12-17 when we migrated to Next and renamed the cookies
// Old cookies are wasting requests/responses so we purging them
// TODO: remove in future
export default async function clearOldCookies(req, res) {
    try {
        const keepKeys = [
            oauthCookieName,
            regCookieName,
        ];
        const keys = Object.keys(req.cookies);
        for (let i = 0; i < 3 && i < keys.length; ++i) {
            const key = keys[i];
            if (!keepKeys.includes(key)) {
                res.setHeader('Set-Cookie', key + '=deleted; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT');
            }
        }
    } catch (err) {
        console.error('ERROR: cannot clear old cookies', err);
    }
}
