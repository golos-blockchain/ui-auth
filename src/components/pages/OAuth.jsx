import React from 'react';
import { Helmet } from 'react-helmet';
import { withRouter, } from 'react-router';
import tt from 'counterpart';
import Header from '../modules/Header';
import LoginForm from '../modules/LoginForm';
import { getHost, callApi, getSession, } from '../../utils/OAuthClient';
import LoadingIndicator from '../elements/LoadingIndicator';
import './OAuth.scss';

class OAuth extends React.Component {
    static propTypes = {
    };

    state = {
        submitting: false,
    };

    async componentDidMount() {
        const { client, } = this.props.match.params;
        const res = await callApi('/api/oauth/get_client/' + client + '/' + tt.getLocale());
        let clientObj = await res.json();
        clientObj = clientObj.client;

        const session = await getSession();
        this.setState({
            account: session.account || null,
            client: clientObj || null,
            clientId: client,
            allowPosting: (clientObj && clientObj.authorized) ? clientObj.allowPosting : true,
            allowPostingForcely: clientObj && !clientObj.allowPosting,
            allowActive: clientObj && clientObj.allowActive,
        });
    }

    postingChange = (e) => {
        this.setState({
            allowPosting: e.target.checked,
        });
    };

    postingActiveChange = (e) => {
        this.setState({
            allowActive: e.target.checked,
        });
    };

    _onAllow = async (e) => {
        e.preventDefault();

        this.setState({
            submitting: false,
            done: false,
        });

        try {
            const { allowPosting, allowActive, clientId, } = this.state;
            let res = await callApi('/api/oauth/permissions', {
                client: clientId,
                allowPosting,
                allowActive,
            });
            res = await res.json();
            if (res.status === 'err') {
                throw new Error(res.error);
            }
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

    _onForbid = async (e) => {
        e.preventDefault();

        this.setState({
            allowPosting: false,
            allowActive: false,
        }, () => {
            this._onAllow(e);
        });
    };

    render() {
        const { state, } = this;
        const { account, client, clientId, submitting, done,
            allowPosting, allowPostingForcely, allowActive, } = state;

        if (!account || client === undefined || submitting) {
            return (<div className='Signer_page'>
                <Helmet>
                    <meta charSet='utf-8' />
                    <title>{tt('oauth_request.title')} | {tt('oauth_main_jsx.title')}</title>
                </Helmet>
                <Header 
                    logoUrl={'/'} />
                {(account === null) && <LoginForm />}
                {(account !== null) && <center style={{ paddingTop: '10rem', }}>
                    <LoadingIndicator type='circle' size='48px'/>
                    </center>};
            </div>);
        }

        return (
            <div className='Signer_page'>
                <Helmet>
                    <meta charSet='utf-8' />
                    <title>{tt('oauth_request.title')} | {tt('oauth_main_jsx.title')}</title>
                </Helmet>
                <Header
                    logoUrl={'/'}
                    account={account} />
                <div className='Signer_content TransferDonate row'>
                    <div
                        className='column'
                        style={{ maxWidth: '40rem', margin: '0 auto' }}
                    >
                        {!client && <div className='callout alert'>
                            {tt('oauth_request.app_not_exist_ID', {
                                ID: clientId,
                            })}
                        </div>}
                        {client && <form>
                            <h3>{tt('oauth_request.application_requests_access_APP', {
                                APP: client.title,
                            })}</h3>
                            <div style={{ marginTop: '1rem', marginBottom: '1rem', }}>
                                <img className='OAuth-App-Logo' src={getHost() + client.logo} alt={client.title} />
                                <h5>{client.title}</h5>
                                <div>{client.description}</div>
                            </div>
                            <div>
                                {tt('oauth_request.choise_permissions')}
                            </div>
                            <hr />
                            <div className='checkbox-multiline posting'>
                                <input type='checkbox' id='posting' checked={allowPosting} disabled={allowPostingForcely}
                                    onChange={this.postingChange}/>
                                <label htmlFor='posting'>
                                    <b>{tt('oauth_request.posting')}</b>
                                    {tt('oauth_request.posting_descr')}
                                </label>
                            </div>
                            <div className='checkbox-multiline posting_active'>
                                <input type='checkbox' id='posting_active' checked={allowActive}
                                    onChange={this.postingActiveChange} />
                                <label htmlFor='posting_active'>
                                    <b>{tt('oauth_request.posting_active')}</b>
                                    {tt('oauth_request.posting_active_descr')}
                                </label>
                            </div>
                            <hr />
                            <div className='close_tab'>{tt('oauth_request.close_tab')}</div>
                            <hr />
                            <center>
                                <button className='button' onClick={this._onAllow}>
                                    {tt('oauth_request.allow')}
                                </button>
                                <button className='button hollow' onClick={this._onForbid} style={{ marginLeft: '10px', }}>
                                    {tt('oauth_request.forbid')}
                                </button>
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

export default withRouter(OAuth);
