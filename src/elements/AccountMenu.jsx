import React from 'react';
import tt from 'counterpart';
import Link from 'next/link';
import { withRouter, } from 'next/router';
import { callApi, } from '@/utils/OAuthClient';

class AccountMenu extends React.Component {
    static propTypes = {
    };

    onLogout = async () => {
        await callApi('/api/oauth/_/logout', {});
        const { router, } = this.props;
        router.replace(router.asPath);
    };

    render() {
        const { account, } = this.props;
        const isRegister = $GLS_IsBrowser && window.location.pathname.includes('/register');
        if (!account)
            return (<div className='AccountMenu columns shrink'>
                {!isRegister && <Link href='/register'>
                    <button
                        className='button hollow'>
                        {tt('g.sign_up')}
                    </button>
                </Link>}
                <Link href='/login'>
                    <button
                        className='button hollow'>
                        {tt('g.sign_in')}
                    </button>
                </Link>
            </div>);
        return (<div className='AccountMenu columns shrink'>
                <Link href='/'>{account}</Link>
                <button
                    className='button hollow'
                    onClick={this.onLogout}>{tt('g.logout')}</button>
            </div>);
    }
}

export default withRouter(AccountMenu);
