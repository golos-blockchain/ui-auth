import React from 'react';
import { Helmet } from 'react-helmet';
import tt from 'counterpart';
import Header from '../modules/Header';
import LoginForm from '../modules/LoginForm';
import './Login.scss';
import { getSession, } from '../../utils/OAuthClient';

class Login extends React.Component {
    static propTypes = {
    };

    async componentDidMount() {
        const session = await getSession();
        if (session.account)
            window.location.href = '/';
    }

    render() {
        return (
            <div className='Signer_page'>
                <Helmet>
                    <meta charSet='utf-8' />
                    <title>{tt('g.sign_in')} | {tt('oauth_main_jsx.title')}</title>
                </Helmet>
                <Header
                    logoUrl={'/'} />
                {<LoginForm />}
            </div>
        );
    }
}

export default Login;
