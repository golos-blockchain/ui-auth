const path = require('path');
const fs = require('fs');
const golos = require('golos-classic-js');
const tt = require('counterpart');
const Koa = require('koa');
const csrf = require('koa-csrf');
const cors = require('@koa/cors');
//const favicon = require('koa-favicon');
//const isBot = require('koa-isbot');
//const koa_logger = require('koa-logger');
//const prod_logger = require('./prod_logger');
const mount = require('koa-mount');
const static = require('koa-static');
const error = require('koa-json-error');
const useGeneralApi = require('./api/general');
const useRegistrationApi = require('./api/registration');
const useUtilsApi = require('./api/utils');
const useAuthApi = require('./api/auth');
const session = require('./utils/cryptoSession');
const config = require('config');

console.log('application server starting, please wait.');

golos.config.set('websocket', config.get('ws_connection_server') || 'https://api.golos.id');
const CHAIN_ID = config.get('chain_id');
if (CHAIN_ID) {
    golos.config.set('chain_id', CHAIN_ID);
}

tt.registerTranslations('en', require('../src/locales/en.json'));
tt.registerTranslations('ru', require('../src/locales/ru-RU.json'));

tt.setLocale('ru');
tt.setFallbackLocale('en');
tt.setMissingEntryGenerator(key => key);

const app = new Koa();
app.name = 'Golos Register app';
const env = process.env.NODE_ENV || 'development';
const cacheOpts = { maxage: 0, gzip: true };

app.use(cors({ credentials: true,
    exposeHeaders: ['X-Auth-Session', 'Retry-After'],
}));

app.keys = [config.get('session_key')];

const crypto_key = config.get('server_session_secret');

session(app, {
    maxAge: 1000 * 3600 * 24 * 60,
    crypto_key,
    key: config.get('session_cookie_key'),
});
//csrf(app);
// app.use(csrf.middleware);

// load production middleware
if (env === 'production') {
    app.use(require('koa-conditional-get')());
    app.use(require('koa-etag')());
    //app.use(require('koa-compressor')());
}

// Logging
/*if (env === 'production') {
    app.use(prod_logger());
} else {
    app.use(koa_logger());
}*/

app.use(error(err => {
    return {
        status: 'err',
        httpStatus: err.status,
        error: err.message,
        error_str: tt('server_errors.' + err.message, {
            locale: err.messageLocale,
            ...err.messageStrData,
        }),
        error_exception: err.exception,
        ...err.bodyProps,
    };
}));

useRegistrationApi(app);
useGeneralApi(app);
useUtilsApi(app);
useAuthApi(app);

//app.use(favicon(path.join(__dirname, '../app/assets/images/favicons/favicon.ico')));
//app.use(mount('/favicons', staticCache(path.join(__dirname, '../app/assets/images/favicons'), cacheOpts)));
//app.use(mount('/images', staticCache(path.join(__dirname, '../app/assets/images'), cacheOpts)));
//app.use(isBot());

// Proxy asset folder to webpack development server in development mode
if (env === 'production') {
    app.use(async (ctx, next) => {
        if (!ctx.path.startsWith('/static/') &&
            !ctx.path.startsWith('/images/') &&
            !ctx.path.startsWith('/icons/') &&
            !ctx.path.startsWith('/themes/') &&
            !ctx.path.startsWith('/api/')) {
            ctx.url = '/';
        }
        await next();
    })

    app.use(static(path.join(__dirname, '../build'), cacheOpts));
}

app.use(mount('/themes', static(path.join(__dirname, '../themes'), cacheOpts)));

const port = process.env.PORT ? parseInt(process.env.PORT) : 8080;

app.listen(port);

console.log(`Application started on port ${port}`);

module.exports = app;
