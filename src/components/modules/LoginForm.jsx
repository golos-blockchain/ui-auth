import React from 'react';
import tt from 'counterpart';
import LoadingIndicator from '../elements/LoadingIndicator';
import { callApi, } from '../../utils/OAuthClient';
import golos from 'golos-lib-js';

class LoginForm extends React.Component {
    static propTypes = {
    };

    state = {
        error: '',
        submitting: false,
        name: 'cyberfounder',
        password: '5JVFFWRLwz6JoP9kguuRFfytToGU6cLgBVTL9t6NB3D3BQLbUBS',
    };

    async componentDidMount() {
        const res = await callApi('/api/oauth/get_config');
        const config = await res.json();
        golos.config.set('websocket', config.ws_connection_client)
        if (config.chain_id) {
            golos.config.set('chain_id', config.chain_id);
        }
        this.setState({
            service_account: config.service_account,
        });
    }

    onNameChange = e => {
        let name = e.target.value.trim().toLowerCase();

        this.setState({
            name,
        });
    };

    onPasswordChange = e => {
        let password = e.target.value.trim().toLowerCase();

        this.setState({
            password,
        });
    };

    setError = (errMsg) => {
        const [ msg, cause, ] = errMsg.split('|');
        let error = tt('loginform_jsx.' + msg);
        if (cause) {
            console.error(msg + ', cause:', cause);
            error += ' Error: ' + cause;
        } else {
            console.error(msg);
        }
        this.setState({
            error,
            submitting: false,
        });
    };

    _onSubmit = async e => {
        e.preventDefault();

        this.setState({ submitting: true, error: '', });

        try {
            const { state, } = this;
            const { name, password, } = state;

            let auths = [];
            try {
                auths = await golos.auth.login(name, password);
            } catch (err) {
                throw err;
            }
            if (!auths.active) {
                if (auths.posting)
                    throw new Error('posting_key_cannot_be_used');
                else if (auths.owner)
                    throw new Error('owner_key_cannot_be_used');
                else throw new Error('wrong_password');
            }
            await this.serverLogin(name, auths);
        } catch (error) {
            this.setError(error.message);
        }
    };

    setAuthority = async (name, activeWif) => {
        console.log('Setting authority to', name, '...');
        const { service_account, } = this.state;
        if (!service_account) {
            throw new Error('Wrong service_account');
        }
        let acc = (await golos.api.getAccountsAsync([name]))[0];
        if (!acc) {
            throw new Error('No such account'); // unified message
        }
        let active = {...acc.active};
        active.account_auths.push([service_account, 1]);
        let posting = {...acc.posting};
        posting.account_auths.push([service_account, 1]);
        await golos.broadcast.accountUpdateAsync(activeWif,
            name, undefined, active, posting,
            acc.memo_key, acc.json_metadata);
    };

    serverLogin = async (name, auths) => {
        let res = await callApi('/api/oauth/authorize', {
            account: name,
        });
        res = await res.json();
        if (res.status !== 'ok') {
            throw new Error('Cannot authorize|' + res.error);
        }
        if (!res.already_authorized) {
            console.log('login_challenge', res.login_challenge);

            const challenge = {token: res.login_challenge};
            const signatures = golos.auth.signData(JSON.stringify(challenge, null, 0), {
                active: auths.active,
            });

            res = await callApi('/api/oauth/authorize', {
                account: name,
                signatures,
            });
            res = await res.json();
            if (res.status !== 'ok') {
                throw new Error('Cannot authorize|' + res.error);
            } else if (!res.has_authority) {
                await this.setAuthority(name, auths.active);
                res = await callApi('/api/oauth/authorize', {
                    account: name,
                    signatures,
                });
                res = await res.json();
                if (res.status !== 'ok') {
                    throw new Error('Cannot authorize|' + res.error);
                } else if (!res.has_authority) {
                    throw new Error('Cannot set authority|' + res.error);
                }
            }
            window.location.reload();
        } else {
            if (!res.has_authority) {
                await this.setAuthority(name, auths.active);
                res = await callApi('/api/oauth/authorize', {
                    account: name,
                });
                res = await res.json();
                if (!res.already_authorized) {
                    throw new Error('Cannot authorize|' + res.error);
                } else if (!res.has_authority) {
                    throw new Error('Cannot set authority|' + res.error);
                }
            }
            window.location.reload();
        }
    };

    _onCancel = (e) => {
        e.preventDefault();
        // should redirect back to referrer URL
    }

    render() {
        const { state, } = this;
        const { name, password, } = state;

        return (<div className='Login row'>
            <div
                className='column'>
                <img src='/images/signer_lock.png' alt='' />
            </div>
            <div
                className='column'
                style={{ maxWidth: '30rem', margin: '0 auto', paddingTop: '8rem', }}
            >
                <center>
                    <h2>{tt('g.sign_in')}</h2>
                </center>
                <form
                    onSubmit={this._onSubmit}
                    autoComplete='off'
                    noValidate
                    method='post'
                >
                    <div className='input-group'>
                        <span className='input-group-label'>@</span>
                        <input
                            type='text'
                            className='input-group-field'
                            name='name'
                            placeholder={tt('g.enter_username')}
                            autoComplete='off'
                            onChange={this.onNameChange}
                            value={name}
                        />
                    </div>
                    <input
                        type='password'
                        name='password'
                        placeholder={tt('g.password_or_wif')}
                        autoComplete='off'
                        onChange={this.onPasswordChange}
                        value={password}
                    />
                    <center>
                        <button className='button'>
                            {tt('g.sign_in')}
                        </button>
                        {/*<button onClick={this._onCancel} className='button hollow' style={{ marginLeft: '10px', }}>
                            {tt('g.cancel')}
                        </button>*/}
                        {state.submitting ? <LoadingIndicator type='circle' /> : null}
                    </center>
                    <center>
                        {state.error ? (<div className='error'>
                            {state.error}
                        </div>) : null}
                    </center>
                </form>
            </div>
        </div>);
    }
}

export default LoginForm;
