import React from 'react';
import tt from 'counterpart';
import { callApi, } from '../../utils/OAuthClient';
import './AccountMenu.scss';

class AccountMenu extends React.Component {
    static propTypes = {
    };

    onLogout = async () => {
        await callApi('/api/oauth/_/logout');
        window.location.reload();
    };

    render() {
        const { account, } = this.props;
        const isRegister = window.location.pathname.includes('/register');
        if (!account)
            return (<div className='AccountMenu columns shrink'>
                {!isRegister && <a href='/register'>
                    <button
                        className='button hollow'>
                        {tt('g.sign_up')}
                    </button>
                </a>}
                <a href='/login'>
                    <button
                        className='button hollow'>
                        {tt('g.sign_in')}
                    </button>
                </a>
            </div>);
        return (<div className='AccountMenu columns shrink'>
                <a href='/'>{account}</a>
                <button
                    className='button hollow'
                    onClick={this.onLogout}>{tt('g.logout')}</button>
            </div>);
    }
}

export default AccountMenu;
