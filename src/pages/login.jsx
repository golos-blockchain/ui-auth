import React from 'react';
import Head from 'next/head';
import tt from 'counterpart';
import Header from '@/modules/Header';
import LoginForm from '@/modules/LoginForm';
import { redirect, } from '@/server/misc';
import { getOAuthCfg, } from '@/server/oauth';
import { getOAuthSession, } from '@/server/oauthSession';
import { withSecureHeadersSSR, } from '@/server/security';

export const getServerSideProps = withSecureHeadersSSR(async ({ req, res, }) => {
    const holder = await getOAuthSession(req, res);
    if (!holder.oauthEnabled) {
        return await holder.clearAndRedirect();
    }
    const session = holder.session();
    if (session.account) {
        return redirect('/');
    }
    return {
        props: {
            session,
            oauthCfg: getOAuthCfg(),
        },
    };
});

class Login extends React.Component {
    static propTypes = {
    };

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
