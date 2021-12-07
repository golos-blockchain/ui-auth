import golos from 'golos-lib-js';
import config from 'config';

export function initGolos() {
    golos.config.set('websocket', config.get('ws_connection_server') || 'https://api.golos.id');
    const CHAIN_ID = config.get('chain_id');
    if (CHAIN_ID) {
        golos.config.set('chain_id', CHAIN_ID);
    }

    golos.config.set('broadcast_transaction_with_callback', true);
}
