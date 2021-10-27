const koa_router = require('koa-router');
const koa_body = require('koa-body');
const golos = require('golos-lib-js');
const { getRemoteIp, slowDownLimitReq, returnError } = require('../utils/misc');

module.exports = function useUtilsApi(app) {
    const router = koa_router({ prefix: '/api/utils' });

    const koaBody = koa_body();

    router.get('/account_exists/:name', koaBody, async (ctx) => {
        await slowDownLimitReq(ctx, ctx.req, 0.5, 1, 'account_exists');

        const { name, } = ctx.params;

        let res = null;
        try {
            res = await golos.api.getAccountsAsync([name]);
        } catch (err) {
            console.error(`/account_exists/${name}`, err);
            ctx.status = 503;
            return returnError(ctx, 'blockchain_unavailable');
        }

        ctx.body = {
            status: 'ok',
            exists: (res && res.length > 0),
        }
    });

    router.get('/get_account/:name', koaBody, async (ctx) => {
        await slowDownLimitReq(ctx, ctx.req, 0.5, 1, 'get_account');

        const { name, } = ctx.params;

        let res = null;
        try {
            res = await golos.api.getAccountsAsync([name]);
        } catch (err) {
            console.error(`/get_account/${name}`, err);
            ctx.status = 503;
            return returnError(ctx, 'blockchain_unavailable');
        }

        const account = (res && res.length > 0) ? res[0] : null;

        ctx.body = {
            status: 'ok',
            account
        }
    });

    router.get('/get_invite/:public_key', koaBody, async (ctx) => {
        await slowDownLimitReq(ctx, ctx.req, 0.5, 1, 'get_invite');

        const { public_key, } = ctx.params;

        let invite = null;
        try {
            invite = await golos.api.getInviteAsync(public_key);
        } catch (err) {
            if (err.toString().includes('Invalid parameter value')) {
                return returnError(ctx, 'wrong_format');
            }
            console.error(`/get_invite/${public_key}`, err);
            ctx.status = 503;
            return returnError(ctx, 'blockchain_unavailable');
        }

        ctx.body = {
            status: 'ok',
            invite,
        }
    });

    app.use(router.routes());
    app.use(router.allowedMethods({ throw: true, }));
};
