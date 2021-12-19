import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import tt from 'counterpart';
import RemoveAuthority from '@/elements/RemoveAuthority';
import Header from '@/modules/Header';
import { callApi, } from '@/utils/OAuthClient';
import { withRouterHelpers, } from '@/utils/routing';
import { getOAuthCfg, } from '@/server/oauth';
import { getOAuthSession, } from '@/server/oauthSession';
import { withSecureHeadersSSR, } from '@/server/security';

export const getServerSideProps = withSecureHeadersSSR(async ({ req, res, }) => {
    const holder = await getOAuthSession(req, res, true);
    if (!holder.oauthEnabled) {
        return await holder.clearAndRedirect();
    }
    return {
        props: {
            session: holder.session(),
            oauthCfg: getOAuthCfg(),
        },
    };
})

class Index extends React.Component {
    static propTypes = {
    };

    state = {
    };

    async forbid(client) {
        let res = await callApi('/api/oauth/logout/' + client);
        await res.json();
        const { routerHelpers, } = this.props;
        routerHelpers.refresh()
    };

    render() {
        const { session, oauthCfg, } = this.props;
        const { account, clients, } = session;
        const { service_account, sign_endpoint, } = oauthCfg;
        let actions = [];
        for (let action of [
            'transfer', 'donate', 'delegate_vs']) {
            actions.push(<Link href={`/sign/${action}`} key={action}>
                    <a>
                        <button className='button hollow' style={{ marginRight: '10px', }}>
                            {tt(`oauth_main_jsx.${action}`)}
                        </button>
                    </a>
                </Link>);
        }
        let clientList = [];
        const linkifyClient = (domNode, url) => {
            return (<a href={url} target='_blank' rel='noopener noreferrer nofollow'>
                    {domNode}
                </a>);
        };
        for (const [key, obj] of Object.entries(clients)) {
            let objLogo = (<img src={obj.logo} alt={obj.title} />);
            let objTitle = obj.title;
            if (obj.url) {
                objLogo = linkifyClient(objLogo, obj.url);
                objTitle = linkifyClient(objTitle, obj.url);
            }
            clientList.push(<tr key={key}>
                    <td>
                        {objLogo}
                    </td>
                    <td>
                        {objTitle}
                    </td>
                    <td>
                        {obj.allowPosting ? <b className='posting'>posting</b> : null}
                        {obj.allowActive ? <b className='active'>active</b> : null}
                    </td>
                    <td>
                        <Link href={'/oauth/' + key + '?from_main=1'} passHref>
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

export default withRouterHelpers(Index);
