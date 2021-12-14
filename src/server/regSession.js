import { withIronSessionApiRoute, } from 'iron-session/next';
import config from 'config';

const regSessionOpts = {
    cookieName: config.get('session_cookie_key'),
    password: config.get('server_session_secret'),
    cookieOptions: {
        sameSite: 'none',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 1000 * 3600 * 24 * 60,
    },
};

export const initRegSession = async (req, res) => {
    await (withIronSessionApiRoute((req_, res_) => {}, regSessionOpts))(req, res);
    return req.session;
};

export const regSessionMiddleware = async (req, res, next) => {
    await initRegSession(req, res);
    next();
};
