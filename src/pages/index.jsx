import React from 'react';
import { Helmet } from 'react-helmet';
import tt from 'counterpart';
import RemoveAuthority from '@/elements/RemoveAuthority';
import Header from '@/modules/Header';
import { callApi, } from '@/utils/OAuthClient';
import { getOAuthSession, } from '@/server/oauthSession';

export async function getServerSideProps({ req, res, }) {
    return {
        props: {
            session: await getOAuthSession(req, res),
        },
    };
}

class Index extends React.Component {
    static propTypes = {
    };

    state = {
        account: null,
        clients: {},
        loading: true,
    };

    componentDidMount() {
        const { session, } = this.props;
        if (session.oauth_disabled) {
            window.location.href = '/register';
            return;
        }
        this.setState({
            loading: false,
            account: session.account,
            clients: session.clients || this.state.clients,
            service_account: session.service_account,
            sign_endpoint: session.sign_endpoint,
        });
    }

    async forbid(client) {
        let res = await callApi('/api/oauth/logout/' + client);
        await res.json();
        window.location.reload();
    };

    render() {
        const { account, clients, loading,
            service_account, sign_endpoint, } = this.state;
        if (loading) {
            return null;
        }
        let actions = [];
        for (let action of [
            'transfer', 'donate', 'delegate_vs']) {
            actions.push(<a href={`/sign/${action}`}>
                <button className='button hollow' style={{ marginRight: '10px', }}>
                    {tt(`oauth_main_jsx.${action}`)}
                </button>
            </a>);
        }
        let clientList = [];
        for (const [key, obj] of Object.entries(clients)) {
            clientList.push(<tr key={key}>
                    <td>
                        <img src={getHost() + obj.logo} alt={obj.title} />
                    </td>
                    <td>
                        {obj.title}
                    </td>
                    <td>
                        {obj.allowPosting ? <b className='posting'>posting</b> : null}
                        {obj.allowActive ? <b className='active'>active</b> : null}
                    </td>
                    <td>
                        <a href={'/oauth/' + key + '?from_main=1'}>
                            <button className='button hollow'>
                                {tt('g.permissions')}
                            </button>
                        </a>
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
                <Helmet>
                    <meta charSet='utf-8' />
                    <title>{tt('oauth_main_jsx.title')}</title>
                </Helmet>
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

export default Index;
