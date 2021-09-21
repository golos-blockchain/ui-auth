import React from 'react';
import { Helmet } from 'react-helmet';
import tt from 'counterpart';
import Header from '../modules/Header';
import './Login.scss';
import { callApi, } from '../../utils/OAuthClient';
import golos from 'golos-classic-js';

class Login extends React.Component {
    static propTypes = {
    };

    state = {
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

    _onSubmit = async e => {
        e.preventDefault();

        const { state, } = this;
        const { name, password, service_account, } = state;

        let auths = [];
        try {
            auths = await golos.auth.login(name, password);
        } catch (err) {
            alert(err);
            return;
        }
        if (!auths.active && auths.posting) {
            alert('posting_key_cannot_be_used');
            return;
        }
        if (!auths.active && auths.owner) {
            alert('owner_key_cannot_be_used');
            return;
        }
        if (!auths.active) {
            alert('wrong_password');
            return;
        }
        let acc = (await golos.api.getAccountsAsync([name]))[0];
        if (!acc) {
            alert('no_such_account');
            return;
        }
        alert(JSON.stringify(acc, null, 2));

        if (!service_account) {
            alert('Wrong service_account');
            return;
        }
        let active = {...acc.active};
        active.account_auths.push([service_account, 1]);
        let posting = {...acc.posting};
        posting.account_auths.push([service_account, 1]);
        golos.broadcast.accountUpdate(auths.active,
            name, undefined, active, posting,
            acc.memo_key, acc.json_metadata, (err, res) => {
            if (err) {
                alert(err);
                return;
            }

        });
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
                            <input
                                type='text'
                                name='name'
                                placeholder={tt('g.enter_username')}
                                autoComplete='off'
                                disabled={state.submitting}
                                onChange={this.onNameChange}
                                value={name}
                            />
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
