import React from 'react';
import { Helmet } from 'react-helmet';
import tt from 'counterpart';
import Header from '../modules/Header';
import { getSession, } from '../../utils/OAuthClient';
import AccountMenu from '../elements/AccountMenu';

class Main extends React.Component {
    static propTypes = {
    };

    state = {
        account: null,
    };

    async componentDidMount() {
        const session = await getSession();
        this.setState({
            account: session.account,
        });
    }

    render() {
        const {account} = this.state;
        let topRight = null;
        if (account) {
            topRight = <AccountMenu account={account} />;
        }
        let actions = [];
        for (let action of [
            'transfer', 'donate', 'delegate_vesting_shares']) {
            actions.push(<a href={`/sign/${action}?compose=true`}>
                <button className='button hollow' style={{ marginRight: '10px', }}>
                    {tt(`oauth_main_jsx.${action}`)}
                </button>
            </a>);
        }
        return (
            <div className='Login_theme'>
                <Helmet>
                    <meta charSet='utf-8' />
                    <title>{tt('g.sign_in')}</title>
                </Helmet>
                <Header logo={'/icons/golos.svg'}
                    title={'GOLOS signer'}
                    titleUppercase={false}
                    logoUrl={'/'}
                    topRight={topRight} />
                <div className='Login row'>
                    <div
                        className='column'
                        style={{ maxWidth: '40rem', margin: '0 auto' }}
                    >
                        <h3>{tt('oauth_main_jsx.trx_title')}</h3>
                        {actions}
                    </div>
                </div>
            </div>
        );
    }
}

export default Main;
