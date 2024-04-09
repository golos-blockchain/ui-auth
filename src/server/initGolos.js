const golos = require('golos-lib-js')
const GolosDexApi = require('golos-dex-lib-js').default
const config = require('config');

function initGolos() {
    golos.config.set('websocket', config.get('ws_connection_server') || 'https://api.golos.id');
    const CHAIN_ID = config.get('chain_id');
    if (CHAIN_ID) {
        golos.config.set('chain_id', CHAIN_ID);
    }

    golos.config.set('broadcast_transaction_with_callback', true);

    const apidex_service = config.get('apidex_service')
    try {
        new GolosDexApi(golos, {
            host: apidex_service.host
        })
    } catch (err) {
        console.error('GolosDexApi init error:', err)
    }
}

module.exports = {
    initGolos,
};
