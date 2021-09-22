import React from 'react';
import tt from 'counterpart';
import { callApi, } from '../../utils/OAuthClient';

class AccountMenu extends React.Component {
    static propTypes = {
    };

    onLogout = async () => {
        await callApi('/api/oauth/logout');
        window.location.reload();
    };

    render() {
        const { account, } = this.props;
        if (!account)
            return (<span></span>);
        return (<span>
                {account}
                <button
                    className='button hollow'
                    onClick={this.onLogout}>{tt('g.logout')}</button>
            </span>);
    }
}

export default AccountMenu;
