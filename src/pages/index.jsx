import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { withRouter, } from 'next/router';
import tt from 'counterpart';
import RemoveAuthority from '@/elements/RemoveAuthority';
import Header from '@/modules/Header';
import { callApi, } from '@/utils/OAuthClient';
import { getOAuthSession, } from '@/server/oauthSession';

export async function getServerSideProps({ req, res, }) {
    return {
        props: {
            session: await getOAuthSession(req, res, true),
        },
    };
}

class Index extends React.Component {
    static propTypes = {
    };

    state = {
    };

    componentDidMount() {
        const { session, } = this.props;
        if (session.oauth_disabled) {
            window.location.href = '/register';
            return;
        } // TODO: invalid, move to server side
    }

    async forbid(client) {
        let res = await callApi('/api/oauth/logout/' + client);
        await res.json();
        const { router, } = this.props;
        router.replace(router.asPath);
    };

    render() {
        const { session, } = this.props;
        const { account, clients,
            service_account, sign_endpoint, } = session;
        let actions = [];
        for (let action of [
            'transfer', 'donate', 'delegate_vs']) {
            actions.push(<Link href={`/sign/${action}`}>
                    <a>
                        <button className='button hollow' style={{ marginRight: '10px', }}>
                            {tt(`oauth_main_jsx.${action}`)}
                        </button>
                    </a>
                </Link>);
        }
        let clientList = [];
        for (const [key, obj] of Object.entries(clients)) {
            clientList.push(<tr key={key}>
                    <td>
                        <img src={obj.logo} alt={obj.title} />
                    </td>
                    <td>
                        {obj.title}
                    </td>
                    <td>
                        {obj.allowPosting ? <b className='posting'>posting</b> : null}
                        {obj.allowActive ? <b className='active'>active</b> : null}
                    </td>
                    <td>
                        <Link href={'/oauth/' + key + '?from_main=1'}>
                            <button className='button hollow'>
                                {tt('g.permissions')}
                            </button>
                        </Link>
                        {<button className='button alert' onClick={() => this.forbid(key)}>
                            {tt('g.logout')}
                        </button>}
                    </td>
                </tr>);
        }
        if (clientList.length) {
            clientList = (<table className='client-list'><tbody>{clientList}</tbody></table>);
        } else {
            clientList = <div className='callout'>{tt('oauth_main_jsx.apps_empty')}</div>
        }
        return (
            <div className='Signer_page'>
                <Head>
                    <meta charSet='utf-8' />
                    <title>{tt('oauth_main_jsx.title')}</title>
                </Head>
                <Header
                    logoUrl={'/'}
                    account={account} />
                <div className='Signer_content Main row'>
                    <div
                        className='column'
                        style={{ maxWidth: '40rem', margin: '0 auto' }}
                    >
                        <h3>{tt('oauth_main_jsx.trx_title')}</h3>
                        {actions}
                        <hr/>
                        <h3>{tt('oauth_main_jsx.apps_title')}</h3>
                        {clientList}
                        <hr/>
                        <RemoveAuthority
                            account={account}
                            service_account={service_account}
                            sign_endpoint={sign_endpoint} />
                    </div>
                </div>
            </div>
        );
    }
}

export default withRouter(Index);
