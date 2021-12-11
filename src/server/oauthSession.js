import { withIronSessionApiRoute, } from 'iron-session/next';
import config from 'config';
import { clientFromConfig, } from '@/server/oauth';

export const oauthSessionOpts = {
    cookieName: 'X-OAuth-ISession',
    password: config.get('oauth.server_session_secret'),
    cookieOptions: {
        sameSite: 'none',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 1000 * 3600 * 24 * 60,
    },
};

export const useOAuthSession = async (req, res) => {
    await (withIronSessionApiRoute((req_, res_) => {}, oauthSessionOpts))(req, res);
    return req.session;
};

export const oauthSessionMiddleware = async (req, res, next) => {
    await useOAuthSession(req, res);
    next();
};

export const getOAuthSession = async (req, res, with_clients = true) => {
    const session = await useOAuthSession(req, res);
    let data = {
        account: null,
        clients: {},
        sign_endpoint: new URL('/api/oauth/sign', config.get('oauth.rest_api')).toString(),
        service_account: config.get('oauth.service_account.name'),
    };
    if (!session.account) {
        return data;
    }
    const locale = session.locale || 'ru';
    data.account = session.account;
    if (with_clients === 'true') {
        data.clients = {};
        for (const client in session.clients) {
            let clientMeta = clientFromConfig(client, locale);
            if (clientMeta) {
                const clientS = session.clients[client];
                clientMeta.allowed = clientS.allowed;
                data.clients[client] = clientMeta;
            }
        }
    }
    return data;
}
