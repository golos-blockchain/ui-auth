const Tarantool = require('../tarantool');

async function clearOAuthPendings() {
    console.log('clearOAuthPendings');
    try {
        await Tarantool.instance('tarantool')
            .call('oauth_cleanup',);
    } catch (err) {
        console.error(err);
    }
    setTimeout(clearOAuthPendings,
        (process.env.NODE_ENV === 'production' ? 300 : 10) * 1000);
}

module.exports = clearOAuthPendings;
