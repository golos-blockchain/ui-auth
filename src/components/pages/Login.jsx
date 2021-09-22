import React from 'react';
import { Helmet } from 'react-helmet';
import tt from 'counterpart';
import Header from '../modules/Header';
import './Login.scss';
import { callApi, getSession, } from '../../utils/OAuthClient';
import golos from 'golos-classic-js';
import {Signature, hash} from 'golos-classic-js/lib/auth/ecc'

class Login extends React.Component {
    static propTypes = {
    };

    state = {
        submitting: false,
        name: 'cyberfounder',
        password: '5JVFFWRLwz6JoP9kguuRFfytToGU6cLgBVTL9t6NB3D3BQLbUBS',
    };

    async componentDidMount() {
        const session = await getSession();
        if (session.account)
            window.location.href = '/';

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

    _onSubmit = async e => {
        e.preventDefault();

        const { state, } = this;
        const { name, password, } = state;

        let auths = [];
        try {
            auths = await golos.auth.login(name, password);
        } catch (err) {
            alert(err);
            return;
        }
        if (!auths.active) {
            if (auths.posting)
                alert('posting_key_cannot_be_used');
            else if (auths.owner)
                alert('owner_key_cannot_be_used');
            else alert('wrong_password');
            return;
        }
        this.serverLogin(name, auths);
    };

    setAuthority = async (name, activeWif) => {
        console.log('Setting authority to', name, '...');
        const { service_account, } = this.state;
        if (!service_account) {
            throw new Error('Wrong service_account');
        }
        let acc = (await golos.api.getAccountsAsync([name]))[0];
        if (!acc) {
            throw new Error('no_such_account');
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
        if (!res.already_authorized) {
            console.log('login_challenge', res.login_challenge);

            const signatures = {};
            const challenge = {token: res.login_challenge};
            const bufSha = hash.sha256(JSON.stringify(challenge, null, 0));
            const sign = (role, d) => {
                if (!d) return;
                const sig = Signature.signBufferSha256(bufSha, d);
                signatures[role] = sig.toHex();
            };
            sign('active', auths.active);

            res = await callApi('/api/oauth/authorize', {
                account: name,
                signatures,
            });
            res = await res.json();
            if (res.status !== 'ok') {
                alert('Cannot authorize');
                return;
            } else if (!res.has_authority) {
                await this.setAuthority(name, auths.active);
                res = await callApi('/api/oauth/authorize', {
                    account: name,
                    signatures,
                });
                res = await res.json();
                if (!res.status === 'ok') {
                    alert('Cannot authorize');
                    return;
                } else if (!res.has_authority) {
                    alert('Cannot set authority');
                    return;
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
                    alert('Cannot authorize');
                    return;
                } else if (!res.has_authority) {
                    alert('Cannot set authority');
                    return;
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

        return (
            <div className='Login_theme'>
                <Helmet>
                    <meta charSet='utf-8' />
                    <title>{tt('g.sign_in')}</title>
                </Helmet>
                <Header logo={'/icons/golos.svg'}
                    title={'GOLOS signer'}
                    titleUppercase={false}
                    logoUrl={'/'} />
                <div className='Login row'>
                    <div
                        className='column'
                        style={{ maxWidth: '30rem', margin: '0 auto' }}
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
                                    disabled={state.submitting}
                                    onChange={this.onNameChange}
                                    value={name}
                                />
                            </div>
                            <input
                                type='password'
                                name='password'
                                placeholder={tt('g.password_or_wif')}
                                autoComplete='off'
                                disabled={state.submitting}
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
                            </center>
                        </form>
                    </div>
                </div>
            </div>
        );
    }
}

export default Login;
