import { withIronSessionApiRoute, } from 'iron-session/next';
import config from 'config';
import clearOldCookies from '@/server/clearOldCookies';

export const cookieName = config.get('session_cookie_key');

const isProduction = process.env.NODE_ENV === 'production'
const regSessionOpts = {
    cookieName,
    password: config.get('server_session_secret'),
    cookieOptions: {
        sameSite: isProduction ? 'none' : 'strict',
        secure: isProduction,
        maxAge: 1000 * 3600 * 24 * 60,
    },
};

export const initRegSession = async (req, res) => {
    await (withIronSessionApiRoute((req_, res_) => {}, regSessionOpts))(req, res);
    return req.session;
};

export const regSessionMiddleware = async (req, res, next) => {
    await initRegSession(req, res);
    await clearOldCookies(req, res);
    next();
};
