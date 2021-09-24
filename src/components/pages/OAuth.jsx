import React from 'react';
import { Helmet } from 'react-helmet';
import { withRouter, } from 'react-router';
import tt from 'counterpart';
import Header from '../modules/Header';
import LoginForm from '../modules/LoginForm';
import { getHost, callApi, getSession, } from '../../utils/OAuthClient';
import LoadingIndicator from '../elements/LoadingIndicator';
import validate_account_name from '../../utils/validate_account_name';
import golos from 'golos-lib-js';
import { Asset } from 'golos-lib-js/lib/utils';
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

    _onSubmit = async (e) => {
        e.preventDefault();

        this.setState({
            submitting: false,
        });

        try {
            const { allowPosting, allowActive, clientId, } = this.state;
            const res = await callApi('/api/oauth/permissions', {
                client: clientId,
                allowPosting,
                allowActive,
            });
        }
        catch (error) {
            console.error(error);
            alert(error.toString());
        }

        this.setState({
            submitting: false,
        });
    };

    render() {
        const { state, } = this;
        const { account, client, clientId, submitting,
            allowPosting, allowPostingForcely, allowActive, } = state;

        if (!account || client === undefined || submitting) {
            return (<div className='Login_theme'>
                <Helmet>
                    <meta charSet='utf-8' />
                    <title>{tt('oauth_request.title')} | {tt('oauth_main_jsx.title')}</title>
                </Helmet>
                <Header logo={'/icons/golos.svg'}
                    title={'GOLOS signer'}
                    titleUppercase={false}
                    logoUrl={'/'} />
                {(account === null) && <LoginForm />}
                {(account !== null) && <center style={{ paddingTop: '10rem', }}>
                    <LoadingIndicator type='circle' size='48px'/>
                    </center>};
            </div>);
        }

        return (
            <div className='Login_theme'>
                <Helmet>
                    <meta charSet='utf-8' />
                    <title>{tt('oauth_request.title')} | {tt('oauth_main_jsx.title')}</title>
                </Helmet>
                <Header logo={'/icons/golos.svg'}
                    title={'GOLOS signer'}
                    titleUppercase={false}
                    logoUrl={'/'}
                    account={account} />
                <div className='Login TransferDonate row'>
                    <div
                        className='column'
                        style={{ maxWidth: '40rem', margin: '0 auto' }}
                    >
                        {!client && <div className='callout alert'>
                            {tt('oauth_request.app_not_exist_ID', {
                                ID: clientId,
                            })}
                        </div>}
                        {client && <div>
                            <h3>{tt('oauth_request.application_requests_access_APP', {
                                APP: client.title,
                            })}</h3>
                            <div style={{ marginTop: '1rem', marginBottom: '1rem', }}>
                                <img className='OAuth-App-Logo' src={getHost() + client.logo} />
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
                                <label for='posting'>
                                    <b>{tt('oauth_request.posting')}</b>
                                    {tt('oauth_request.posting_descr')}
                                </label>
                            </div>
                            <div className='checkbox-multiline posting_active'>
                                <input type='checkbox' id='posting_active' checked={allowActive}
                                    onChange={this.postingActiveChange} />
                                <label for='posting_active'>
                                    <b>{tt('oauth_request.posting_active')}</b>
                                    {tt('oauth_request.posting_active_descr')}
                                </label>
                            </div>
                            <hr />
                            <div className='close_tab'>{tt('oauth_request.close_tab')}</div>
                            <hr />
                            <center>
                                <button className='button' onClick={this._onSubmit}>
                                    {tt('oauth_request.allow')}
                                </button>
                                <button className='button hollow' style={{ marginLeft: '10px', }}>
                                    {tt('oauth_request.forbid')}
                                </button>
                            </center>
                        </div>}
                    </div>
                </div>
            </div>
        );
    }
};

export default withRouter(OAuth);
