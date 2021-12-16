const Tarantool = require('./server/tarantool');

async function clearPendings() {
    console.log('clearPendings');
    try {
        await Tarantool.instance('tarantool')
            .call('oauth_cleanup',);
    } catch (err) {
        console.error(err);
    }
    setTimeout(clearPendings,
        (process.env.NODE_ENV === 'production' ? 300 : 10) * 1000);
}
clearPendings();
