const koa_router = require('koa-router');
const koa_body = require('koa-body');

module.exports = function useOAuthStub(app) {
    const router = koa_router({ prefix: '/api/oauth' });

    const koaBody = koa_body();

    const resp = (ctx) => {
        ctx.body = {
            oauth_disabled: true,
        };
    };

    router.get('/_/get_config', koaBody, resp);

    router.get('/_/get_session/:with_clients/:locale', koaBody, resp);

    app.use(router.routes());
    app.use(router.allowedMethods({ throw: true, }));
}
