import { api } from 'golos-lib-js'
import { fetchEx } from 'golos-lib-js/lib/utils'

export default async function getUIAAddress(accName, symbol, okResp, errResp) {
    try {
        if (!symbol)
            return errResp('no_symbol_parameter_in_query')

        if (!accName)
            return errResp('no_account_parameter_in_query')
        let accs
        try {
            accs = await api.getAccounts([accName])
        } catch (err) {
            return errResp('blockchain_unavailable', [err])
        }
        if (!accs[0])
            return errResp('no_such_golos_account', [accName])

        let assets;
        try {
            assets = await api.getAssetsAsync('', [
                symbol,
            ], '', '20', 'by_symbol_name')
        } catch (err) {
            return errResp('blockchain_unavailable', [err])
        }
        if (!assets[0])
            return errResp('no_such_asset')

        let meta = assets[0].json_metadata
        try {
            meta = JSON.parse(meta)
        } catch (err) {
            return errResp('your_asset_has_wrong_json_metadata', [meta])
        }

        let apiURL = meta.deposit && meta.deposit.to_api
        if (!apiURL)
            return errResp('no_deposit_settings_in_your_asset', [meta])
        if (!apiURL.includes('<account>'))
            return errResp('url_template_not_contains_place_for_account_name', [meta])
        apiURL = apiURL.replace(/<account>/g, accName)

        let resp
        try {
            console.log('apiURL', apiURL)
            resp = await fetchEx(apiURL, { timeout: 10000 })
        } catch (err) {
            return errResp('cannot_connect_gateway', [meta.deposit, err])
        }
        try {
            resp = await resp.text()
        } catch (err) {
            return errResp('cannot_get_address_from_gateway', [meta.deposit, err])
        }
        try {
            resp = JSON.parse(resp)
        } catch (err) {
            resp = resp.substring(0, 100)
            return errResp('invalid_json_from_gateway', [meta.deposit, err], resp)
        }

        if (!resp.address)
            return errResp('no_address_field_in_response', [resp], resp)

        return okResp(resp.address)
    } catch (err) {
        return errResp('internal_error', err)
    }
}
