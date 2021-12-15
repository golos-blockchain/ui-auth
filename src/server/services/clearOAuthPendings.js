const Tarantool = require('../tarantool');
const config = require('config');

const isProd = global.isProd;

async function clearOAuthPendings() {
    if (!config.has('oauth')) {
        return;
    }
    console.log('clearOAuthPendings', isProd ? '' : 'in dev mode');
    try {
        await Tarantool.instance('tarantool')
            .call('oauth_cleanup',);
    } catch (err) {
        console.error(err);
    }
    setTimeout(clearOAuthPendings,
        (isProd ? 300 : 10) * 1000);
}

module.exports = clearOAuthPendings;
