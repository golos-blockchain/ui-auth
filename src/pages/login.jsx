import React from 'react';
import Head from 'next/head';
import tt from 'counterpart';
import Header from '@/modules/Header';
import LoginForm from '@/modules/LoginForm';
import { getOAuthCfg, } from '@/server/oauth';
import { getOAuthSession, } from '@/server/oauthSession';

export async function getServerSideProps({ req, res, }) {
    const session = await getOAuthSession(req, res);
    if (session.account) {
        return {
            redirect: {
                destination: '/',
                permanent: false,
            },
        };
    }
    return {
        props: {
            session,
            oauthCfg: getOAuthCfg(),
        },
    };
}

class Login extends React.Component {
    static propTypes = {
    };

    componentDidMount() {
        const { session, } = this.props;
        if ($GLS_IsBrowser && session.oauth_disabled) {
            window.location.href = '/register';
            return;
        }
        if ($GLS_IsBrowser && session.account)
            window.location.href = '/';
    }

    render() {
        const { session, oauthCfg, } = this.props;
        return (
            <div className='Signer_page'>
                <Head>
                    <meta charSet='utf-8' />
                    <title>{tt('g.sign_in')} | {tt('oauth_main_jsx.title')}</title>
                </Head>
                <Header
                    logoUrl={'/'} />
                {<LoginForm session={session} oauthCfg={oauthCfg} />}
            </div>
        );
    }
}

export default Login;
