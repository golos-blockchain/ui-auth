import { withIronSessionApiRoute, } from 'iron-session/next';
import config from 'config';
import clearOldCookies from '@/server/clearOldCookies';
import { throwErr, } from '@/server/error';
import { redirect, } from '@/server/misc';
import { clientFromConfig, oauthEnabled, } from '@/server/oauth';

export const cookieName = 'X-OAuth-ISession';

const makeSessionOpts = () => {
    let password = 'destroying_destroying_destroying';
    if (oauthEnabled()) {
        password = config.get('oauth.server_session_secret');
    }
    return {
        cookieName,
        password,
        cookieOptions: {
            sameSite: 'none',
            secure: process.env.NODE_ENV === 'production',
            maxAge: 1000 * 3600 * 24 * 60,
        },
    };
};

export const initOAuthSession = async (req, res) => {
    const opts = makeSessionOpts();
    await (withIronSessionApiRoute((req_, res_) => {}, opts))(req, res);
    return req.session;
};

export const oauthSessionMiddleware = async (req, res, next) => {
    await initOAuthSession(req, res);
    await clearOldCookies(req, res);
    if (oauthEnabled()) {
        next();
    } else {
        req.session.destroy();
        throwErr(req, 404, 'Not Found');
    }
};

class OAuthSessionHolder {
    account = null;
    clients = {};
    oauthEnabled = true;
    constructor(req) {
        this.req = req;
    }
    clearAndRedirect = async (path = '/register') => {
        this.req.session.destroy()
        return redirect(path)
    }
    freeze = async (account) => {
        return this.clearAndRedirect('/login?frozen=' + account)
    }
    session = () => {
        const { account, clients, } = this;
        return {
            account,
            clients,
        };
    }
}

export const getOAuthSession = async (req, res, with_clients = false) => {
    const session = await initOAuthSession(req, res);
    let data = new OAuthSessionHolder(req);
    if (!oauthEnabled()) {
        data.oauthEnabled = false;
        return data;
    }
    if (!session.account) {
        return data;
    }
    const locale = session.locale || 'ru';
    data.account = session.account;
    if (with_clients) {
        for (const client in session.clients) {
            let clientMeta = clientFromConfig(client, locale);
            if (clientMeta) {
                const clientS = session.clients[client];
                clientMeta.authorized = true;
                clientMeta.allowed = clientS.allowed;
                data.clients[client] = clientMeta;
            }
        }
    }
    return data;
}
