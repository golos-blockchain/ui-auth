import config from 'config'

function recoveryEnabled() {
    return config.has('recovery')
}

export function getRecoveryCfg() {
    const enabled = recoveryEnabled()
    if (!enabled) {
        return {
            recoveryEnabled: false
        }
    }
    return {
        recoveryEnabled: true,
        ws_connection_client: config.get('recovery.ws_connection_client'),
        chain_id: config.has('recovery.chain_id') && config.get('recovery.chain_id'),
        blogs_service: config.has('recovery.blogs_service') && config.get('recovery.blogs_service'),
        captcha: config.has('recovery.captcha') && config.get('recovery.captcha')
    }
}
