import React from 'react';
import tt from 'counterpart';
import { callApi, } from '../../utils/OAuthClient';
import './AccountMenu.scss';

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
            return (<div class='AccountMenu columns shrink'>
                <a href='/register'>
                    <button
                        className='button hollow'>
                        {tt('g.sign_up')}
                    </button>
                </a>
                <a href='/login'>
                    <button
                        className='button hollow'>
                        {tt('g.sign_in')}
                    </button>
                </a>
            </div>);
        return (<div class='AccountMenu columns shrink'>
                <a href='/'>{account}</a>
                <button
                    className='button hollow'
                    onClick={this.onLogout}>{tt('g.logout')}</button>
            </div>);
    }
}

export default AccountMenu;
