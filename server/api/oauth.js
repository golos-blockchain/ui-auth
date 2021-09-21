const koa_router = require('koa-router');
const koa_body = require('koa-body');
const config = require('config');
const session = require('../utils/cryptoSession');

module.exports = function useOAuthApi(app) {
    const router = koa_router({ prefix: '/api/oauth' });

    const crypto_key = config.get('oauth.server_session_secret');

    session(router, {
        maxAge: 1000 * 3600 * 24 * 60,
        crypto_key,
        key: 'X-OAuth-Session',
    });

    const koaBody = koa_body();

    router.get('/get_client/:client', koaBody, async (ctx) => {
        ctx.body = {
        };
    });

    router.get('/get_config', koaBody, async (ctx) => {
        ctx.body = {
            ws_connection_client: config.get('oauth.ws_connection_client'),
            chain_id: config.has('chain_id') && config.get('oauth.chain_id'),
            service_account: config.get('oauth.service_account.name'),
        };
    });

    router.post('/check_auth', koaBody, async (ctx) => {
    });

    router.post('/sign', koaBody, async (ctx) => {
    });

    app.use(router.routes());
    app.use(router.allowedMethods({ throw: true, }));
};
