import React from 'react';
import tt from 'counterpart';
import golos from 'golos-lib-js';
import { PublicKey, } from 'golos-lib-js/lib/auth/ecc';
import { callApi, } from '@/utils/OAuthClient';

class RemoveAuthority extends React.Component {
    removeAuthority = async () => {
        if (!window.confirm(tt('oauth_main_jsx.remove_authority_confirm')))
            return;

        try {
            const { service_account, account, sign_endpoint, } = this.props;
            if (!service_account) {
                throw new Error('Wrong service_account');
                return;
            }
            golos.config.set('websocket', sign_endpoint);
            let acc = (await golos.api.getAccountsAsync([account]))[0];
            if (!acc) {
                throw new Error('No such account');
                return;
            }
            let active = {...acc.active};
            active.account_auths = active.account_auths.filter(a => (!a[0] || a[0] !== service_account));
            let posting = {...acc.posting};
            posting.account_auths = posting.account_auths.filter(a => (!a[0] || a[0] !== service_account));
            await golos.broadcast.accountUpdateAsync('(active)',
                account, undefined, active, posting,
                new PublicKey(null).toString(), acc.json_metadata);
        } catch (err) {
            alert(err);
            return;
        }
        await callApi('/api/oauth/_/logout', {});
        window.location.reload();
    };

    render() {
        if (!this.props.account)
            return (<div></div>);
        return (<button className='button hollow'
            style={{ fontSize: '0.7rem', }}
            onClick={this.removeAuthority}>
            {tt('oauth_main_jsx.remove_authority')}
        </button>)
    }
}

export default RemoveAuthority;
