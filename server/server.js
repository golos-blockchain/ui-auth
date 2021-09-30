const path = require('path');
const fs = require('fs');
const golos = require('golos-lib-js');
const tt = require('counterpart');
const Koa = require('koa');
const csrf = require('koa-csrf');
const cors = require('@koa/cors');
//const favicon = require('koa-favicon');
//const isBot = require('koa-isbot');
//const koa_logger = require('koa-logger');
//const prod_logger = require('./prod_logger');
const helmet = require('koa-helmet');
const mount = require('koa-mount');
const static = require('koa-static');
const error = require('koa-json-error');
process.env.NODE_CONFIG_ENV = 'oauth';
const config = require('config');
const useGeneralApi = require('./api/general');
const useUtilsApi = require('./api/utils');
const useAuthApi = require('./api/auth');
const useOAuthApi = require('./api/oauth');
const clearDelegations = require('./clearDelegations');
const { convertEntriesToArrays, } = require('./utils/misc');

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
const cacheOpts = { maxage: 0, gzip: true };

app.use(cors({ credentials: true,
    exposeHeaders: ['X-Auth-Session', 'Retry-After'],
}));

app.keys = [config.get('session_key')];

//csrf(app);
// app.use(csrf.middleware);
app.use(helmet());

const env = process.env.NODE_ENV || 'development';

// helmet wants some things as bools and some as lists, makes config difficult.
// our config uses strings, this splits them to lists on whitespace.
if (env === 'production') {
    const helmetConfig = {
        directives: convertEntriesToArrays(config.get('helmet.directives')),
        reportOnly: false,
    };
    helmetConfig.directives.reportUri = '/api/csp_violation';
    app.use(helmet.contentSecurityPolicy(helmetConfig));
}

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

useGeneralApi(app);
useUtilsApi(app);
useAuthApi(app);
useOAuthApi(app);

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
            !ctx.path.startsWith('/oauth_clients/') &&
            !ctx.path.startsWith('/api/')) {
            ctx.url = '/';
        }
        await next();
    })

    app.use(static(path.join(__dirname, '../build'), cacheOpts));
}

app.use(mount('/themes', static(path.join(__dirname, '../themes'), cacheOpts)));
app.use(mount('/oauth_clients', static(path.join(__dirname, '../oauth_clients'), cacheOpts)));

const port = process.env.PORT ? parseInt(process.env.PORT) : 8080;

app.listen(port);

console.log(`Application started on port ${port}`);

clearDelegations();

module.exports = app;
