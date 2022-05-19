import React from 'react';
import tt from 'counterpart';
import golos from 'golos-lib-js';
import Head from 'next/head';
import Header from '@/modules/Header';
import LoginForm from '@/modules/LoginForm';
import PendingTx from '@/modules/PendingTx';
import PermissionsList from '@/modules/PermissionsList';
import { callApi, } from '@/utils/OAuthClient';
import LoadingIndicator from '@/elements/LoadingIndicator';
import { permissions,
    initOpsToPerms, } from '@/utils/oauthPermissions';
import { getOAuthCfg, clientFromConfig, } from '@/server/oauth';
import { getOAuthSession, } from '@/server/oauthSession';
import { withSecureHeadersSSR, } from '@/server/security';

const opsToPerms = initOpsToPerms(permissions);

export const getServerSideProps = withSecureHeadersSSR(async ({ req, res, params, }) => {
    const holder = await getOAuthSession(req, res, true);
    if (!holder.oauthEnabled) {
        return await holder.clearAndRedirect();
    }
    const session = holder.session();
    let clientObj = clientFromConfig(params.client, req.session.locale || 'ru');
    clientObj = { ...clientObj, ...session.clients[params.client], };
    return {
        props: {
            session,
            client: params.client,
            clientObj,
            requested: params.perms ? params.perms[0] : null,
            oauthCfg: getOAuthCfg(),
        },
    };
})

class OAuth extends React.Component {
    static propTypes = {
    };

    state = {
        submitting: false,
    };

    normalizeRequested(client, requested) {
        requested = requested ? requested.split(',') : [];
        let items = new Map();
        for (let r of requested) {
            if (opsToPerms[r]) {
                items.set(opsToPerms[r][0].perm, opsToPerms[r][0]);
            } else if (permissions[r]) {
                items.set(r, permissions[r]);
            }
        }
        if (client && client.allowed) {
            for (let r of client.allowed) {
                if (!permissions[r]) continue;
                items.set(r, permissions[r]);
            }
        }
        return items;
    }

    async componentDidMount() {
        const { client, clientObj, requested, } = this.props;

        const params = new URLSearchParams(window.location.search);
        const opsHash = params.get('ops_hash');
        this.setState({
            client: clientObj || null,
            error: (clientObj ? null : tt('oauth_request.app_not_exist_ID', {
                    ID: client,
                })),
            clientId: client,
            pending: opsHash,
            requested: this.normalizeRequested(clientObj,
                opsHash ? null : requested),
        });
        if (opsHash)
            this.loadPendingTx(opsHash);
    }

    loadPendingTx = async (hash, waited = 0) => {
        const { clientId, } = this.state;
        const res = await callApi('/api/oauth/_/load_pending/' + clientId + '/' + hash);
        let obj = await res.json();
        if (!obj.data) {
            if (waited >= 8000) {
                //console.error('loadPendingTx', obj);
                window.close();
                return;
            }
            console.error('loadPendingTx...');
            const interval = 1000;
            waited += interval;
            setTimeout(() => this.loadPendingTx(hash, waited),
                interval);
        } else {
            if (obj.data.expired) {
                this.setState( {
                    error: tt('oauth_request.pending_tx_expired'),
                });
                return;
            }
            let addForOp = new Map();

            if (!obj.data.tx
                || !obj.data.tx.operations) {
                console.error('loadPendingTx', obj);
                return;
            }
            for (let op of obj.data.tx.operations) {
                let perms = opsToPerms[op[0]];
                if (!perms) {
                    //!
                    console.log(op);
                    return;
                }
                for (let perm of perms) {
                    console.log(perm)
                    if (perm.cond) {
                        const res = perm.cond(op[1], op[0], true);
                        if (res === false || res instanceof Error) {
                            continue;
                        }
                    }
                    addForOp.set(perm.perm, perm);
                    op.push(perm);
                    break;
                }
                if (op.length < 3) {
                    //!
                    return;
                }
            }
            this.setState({
                pendingTx: obj.data,
                addForOp,
            });
        }
    };

    _saveAllow = async (forbid = false, pending = false) => {
        let allowed = null;
        if (!forbid) {
            allowed = new Set(this.state.requested.keys());
            if (pending) {
                allowed = new Set([...allowed, ...this.state.addForOp.keys()]);
            }
        }

        const { clientId, } = this.state;
        let res = await callApi('/api/oauth/_/permissions', {
            client: clientId,
            allowed: allowed ? [...allowed] : null,
        });
        res = await res.json();
        if (res.status === 'err') {
            throw new Error(res.error);
        }
    }

    _signPending = async () => {
        const { session, oauthCfg, } = this.props;
        const { sign_endpoint, } = oauthCfg;
        golos.config.set('websocket', sign_endpoint);
        golos.config.set('credentials', 'include');
        const { pendingTx, } = this.state;
        const keys = []
        if (pendingTx.tx._meta && pendingTx.tx._meta._keys) {
            const key = '(' + pendingTx.tx._meta._keys.join(',') + ')'
            keys.push(key)
        }
        let res, err;
        try {
            res = await golos.broadcast.sendAsync(pendingTx.tx, keys);
        } catch (ex) {
            err = ex;
        }
        const { clientId, pending, } = this.state;
        let ret = await callApi('/api/oauth/_/return_pending/' + clientId + '/' + pending, {
            err: err ? JSON.stringify(err, Object.getOwnPropertyNames(err)) : '',
            res: res ? JSON.stringify(res) : '',
        });
        ret = await ret.json();
    };

    _onAllow = async (e, forbid = false) => {
        e.preventDefault();
        this.setState({
            submitting: true,
            done: false,
        });

        const isPending = !!this.state.pendingTx;

        try {
            if (isPending) {
                await this._signPending();
            }
            await this._saveAllow(forbid, isPending);
            this.setState({
                submitting: false,
                done: true,
            });
            const params = new URLSearchParams(window.location.search);
            if (params.get('from_main')) {
                window.location.href = '/';
            } else {
                window.close();
            }
        }
        catch (error) {
            console.error(error);
            alert(error.toString());
        }

        this.setState({
            submitting: false,
        });
    };

    _onAllowOnce = async (e) => {
        e.preventDefault();
        this.setState({
            submitting: true,
            done: false,
        });
        try {
            await this._signPending();
        } catch (err) {
            this.setState({
                submitting: false,
            });
            throw err;
        }
        this.setState({
            submitting: false,
            done: true,
        });
        window.close();
    };

    _onForbid = async (e) => {
        await this._onAllow(e, true);
    };

    _onForbidOnce = async (e) => {
        e.preventDefault();
        const { clientId, pending, } = this.state;
        let res = await callApi('/api/oauth/_/forbid_pending/' + clientId + '/' + pending, {
        });
        res = await res.json();
        if (res.status === 'ok') {
            window.close();
            this.setState({
                done: true,
            });
            return;
        }
        console.error(res);
        alert('Error: ' + JSON.stringify(res));
    };

    render() {
        const { state, } = this;
        const { client, clientId, submitting, done,
            pending, pendingTx,
            requested,
            error, } = state;
        const { session, } = this.props;
        const { account, } = session;

        if (!account || client === undefined || submitting || (pending && !pendingTx && !error)) {
            const { session, oauthCfg, } = this.props;
            return (<div className='Signer_page'>
                <Head>
                    <meta charSet='utf-8' />
                    <title>{tt('oauth_request.title')} | {tt('oauth_main_jsx.title')}</title>
                </Head>
                <Header 
                    logoUrl={'/'} />
                {(account === null) && <LoginForm session={session} oauthCfg={oauthCfg} />}
                {(account !== null) && <center style={{ paddingTop: '10rem', }}>
                    <LoadingIndicator type='circle' size='48px'/>
                    </center>};
            </div>);
        }

        return (
            <div className='Signer_page'>
                <Head>
                    <meta charSet='utf-8' />
                    <title>{tt('oauth_request.title')} | {tt('oauth_main_jsx.title')}</title>
                </Head>
                <Header
                    logoUrl={'/'}
                    account={account} />
                <div className='Signer_content TransferDonate row'>
                    <div
                        className='column'
                        style={{ maxWidth: '40rem', margin: '0 auto' }}
                    >
                        {error && <div className='callout alert'>
                            {error}
                        </div>}
                        {!error && <form>
                            <h3>{tt('oauth_request.application_requests_access_APP', {
                                APP: client.title,
                            })}</h3>
                            <div style={{ marginTop: '1rem', marginBottom: '1rem', }}>
                                <img className='OAuth-App-Logo' src={client.logo} alt={client.title} />
                                <h5>{client.title}</h5>
                                <div>{client.description}</div>
                            </div>
                            {pendingTx ? <div>
                                    <hr />
                                    <PendingTx tx={pendingTx} />
                                    <hr />
                                </div> : null}
                            {!pendingTx ? <div>
                                {(requested && requested.size) ?
                                    tt('oauth_request.choise_permissions') :
                                    tt('oauth_request.no_perms')}
                            </div> : null}
                            {!pendingTx ? <hr /> : null}
                            {(!pendingTx && requested && requested.size) ? <div>
                                <PermissionsList items={requested} />
                                <hr />
                                <div className='close_tab'>{tt('oauth_request.close_tab')}</div>
                                <hr />
                            </div> : null}
                            <center>
                                <button className='button' onClick={this._onAllow}>
                                    {pending ? tt('oauth_request.allow_always') : tt('oauth_request.allow')}
                                </button>
                                {pending ? <button className='button hollow' onClick={this._onAllowOnce} style={{ marginLeft: '10px', }}>
                                    {tt('oauth_request.allow_once')}
                                </button> : null}
                                {!pending && <button className='button hollow' onClick={this._onForbid} style={{ marginLeft: '10px', }}>
                                    {tt('oauth_request.forbid')}
                                </button>}
                                {pending && <button className='button hollow' onClick={this._onForbidOnce} style={{ marginLeft: '10px', }}>
                                    {tt('oauth_request.forbid_once')}
                                </button>}
                                {done ? <span className='success done'>
                                    {tt('g.done')}
                                </span> : null}
                            </center>
                        </form>}
                    </div>
                </div>
            </div>
        );
    }
};

export default OAuth;
