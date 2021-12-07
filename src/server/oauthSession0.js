import nextSession from 'next-session';
import { clientFromConfig, } from '@/server/oauth';

export const oauthSession = nextSession({
    autoCommit: true,
});

export const oauthSessionMiddleware = async (req, res, next) => {
    await oauthSession(req, res);
    next();
};

export const getOAuthSession = async (req, res, with_clients = true) => {
    const session = await oauthSession(req, res);
    console.log(session, session.account);
    let data = {
        account: null,
        clients: {},
    };
    if (!session.account) {
        return data;
    }
    const locale = session.locale || 'ru';
    data.account = session.account;
    data.sign_endpoint = new URL('/api/oauth/sign', config.get('oauth.rest_api')).toString();
    data.service_account = config.get('oauth.service_account.name');
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
