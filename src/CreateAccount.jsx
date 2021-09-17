import React from 'react';
import { Helmet } from 'react-helmet';
import PropTypes from 'prop-types';
import tt from 'counterpart';
import cn from 'classnames';
import { PrivateKey } from 'golos-classic-js/lib/auth/ecc';
import ReCAPTCHA from 'react-google-recaptcha';
import LoadingIndicator from './components/elements/LoadingIndicator';
import Tooltip from './components/elements/Tooltip';
import Header from './components/modules/Header';
import validate_account_name from './validate_account_name';
import KeyFile from './utils/KeyFile';
import GeneratedPasswordInput from './components/elements/GeneratedPasswordInput';
import { APP_DOMAIN, SUPPORT_EMAIL } from './client_config';
import './CreateAccount.scss';
import { getHost, callApi, } from './utils/RegApiClient';

function formatAsset(val) {
    return val;
}

class CreateAccount extends React.Component {
    static propTypes = {
        serverBusy: PropTypes.bool,
    };

    state = {
        fetching: false,
        step: 'sending',
        verificationWay: 'email',
        message: '',

        name: '',
        email: '',
        referrer: '',
        invite_code: '',
        code: '',
        password: '',
        passwordValid: '',
        nameError: '',
        emailHint: '',
        emailError: '',
        inviteHint: '',
        inviteError: '',
        recaptcha_v2: '',
        submitting: false,
        cryptographyFailure: false,
        allBoxChecked: false,
    };

    async componentDidMount() {
        const cryptoTestResult = undefined;
        if (cryptoTestResult !== undefined) {
            console.error(
                'CreateAccount - cryptoTestResult: ',
                cryptoTestResult
            );
            this.setState({ cryptographyFailure: true });
        }

        const invite = new URLSearchParams(window.location.search).get('invite');
        if (invite) {
            if (!validate_account_name(invite)) {
                console.log('Referrer account will be ', invite);
                this.setState({referrer: invite});
            } else {
                this.setState({
                    invite_code: invite,
                    verificationWay: 'invite_code',
                }, () => {
                    this.validateInviteCode(invite);
                });
            }
        }

        let client = '';
        const pathnameParts = window.location.pathname.split('/');
        if (pathnameParts.length >= 3 && pathnameParts[2] === 'register') {
            client = pathnameParts[1];
        } else if (pathnameParts.length >= 2 && pathnameParts[1] && pathnameParts[1] !== 'register') {
            client = pathnameParts[1];
        }

        await callApi(`/api/reg/get_uid`);

        const res = await callApi(`/api/reg/get_client/${client}?locale=${tt.getLocale()}`);
        const data = await res.json();

        console.log('Auth service version:', data.version);

        let theme = 'blogs';
        const config = data.config;
        const cfgclient = config && config.client;
        if (cfgclient) {
            theme = cfgclient.id;
        }
        this._applyTheme(getHost() + '/themes/' + theme + '/theme.css');

        let afterRedirect = document.referrer;
        if (cfgclient && cfgclient.after_redirect) {
            afterRedirect = cfgclient.after_redirect;
            if (!afterRedirect.startsWith('http')) {
                try {
                    afterRedirect = new URL(afterRedirect, cfgclient.origin).href;
                } catch (e) {}
            }
        } else if (!afterRedirect && cfgclient && cfgclient.origin) {
            afterRedirect = cfgclient.origin;
        }

        this.setState({
            loaded: true,
            config: data.config,
            afterRedirect,
        }, () => {
            console.log('afterRedirect is', this.state.afterRedirect);
        });
    }

    checkSocAuth = async (event) => {
        console.log('checkSocAuth');
        window.addEventListener('focus', this.checkSocAuth, {once: true});

        const response = await callApi('/api/reg/check_soc_auth');
        if (response.ok) {
            const result = await response.json();
            if (result.soc_id_type) {
                window.removeEventListener('focus', this.checkSocAuth);
                this.useSocialLogin(result, result.soc_id_type);
            } else if (!event) {
                setTimeout(this.checkSocAuth, 5000);
            } else {
                console.log('checkSocAuth event from focus');
            }
        }
    };

    startSocialLoading = (socName) => {
        this.setState({
            fetching: true,
            step: 'sending',
            verificationWay: 'social-' + socName,
            message: (<div>
                <LoadingIndicator type='circle' size='20px' inline />
                {tt('createaccount_jsx.authorizing_with') + socName + '...'}
                {this._renderSocialButtons()}
            </div>),

            email: '',
        });

        this.checkSocAuth();
    };

    useSocialLogin = (result, socName) => {
        this.updateApiState(result, () => {
            this.setState({
                fetching: false,
                message: (<div>
                    {tt('createaccount_jsx.authorized_with_') + this.state.authType + '.'}
                    {this._renderSocialButtons()}
                </div>),
                verificationWay: 'social-' + socName,

                email: '',
            });
        });
    };

    useVk = (e) => {
        e.preventDefault();
        const authType = 'ВКонтакте'
        this.setState({
            authType
        });
        this.startSocialLoading(authType);
        window.open(`${getHost()}/api/reg/modal/vk`, '_blank');
    };

    useFacebook = (e) => {
        e.preventDefault();
        const authType = 'Facebook'
        this.setState({
            authType
        });
        this.startSocialLoading(authType);
        window.open(`${getHost()}/api/reg/modal/facebook`, '_blank');
    };

    useMailru = (e) => {
        e.preventDefault();
        const authType = 'Mail.Ru'
        this.setState({
            authType
        });
        this.startSocialLoading(authType);
        window.open(`${getHost()}/api/reg/modal/mailru`, '_blank');
    };

    useYandex = (e) => {
        e.preventDefault();
        const authType = 'Яндекс'
        this.setState({
            authType
        });
        this.startSocialLoading(authType);
        window.open(`${getHost()}/api/reg/modal/yandex`, '_blank');
    };

    _applyTheme = (href) => {
        let link = document.createElement('link');
        link.href = href;
        link.type = 'text/css';
        link.rel = 'stylesheet';
        link.media = 'screen,print';

        document.getElementsByTagName('head')[0].appendChild(link);
    };

    _getConfig() {
        let title = tt('createaccount_jsx.title_default');
        let favicon = null;
        let origin = 'https://golos.id';

        const LOGO_TITLE = 'GOLOS';
        const LOGO_SUBTITLE = 'blockchain';
        let logo_title = LOGO_TITLE;
        let logo_subtitle = LOGO_SUBTITLE;
        let logo = '/icons/logo.svg';

        const { config, } = this.state;
        const client = config && config.client && config.client[tt.getLocale()];
        if (client) {
            if (title) {
                title = client.page_title;
            }
            if (client.favicon) {
                favicon = getHost() + '/themes/' + config.client.id + '/' + client.favicon;            
            }
            // - They will be null if not set in client
            logo_title = client.logo_title;
            logo_subtitle = client.logo_subtitle;
            // -
            logo = client.logo ?
                getHost() + '/themes/' + config.client.id + '/' + client.logo
                : logo;
            origin = config.client.origin || origin;
        }

        return { title, favicon, logo_title, logo_subtitle, logo, origin, };
    }

    render() {
        if (!this.state.loaded) {
            return (
                <div className='row'>
                    <div className='column'>{tt('g.loading')}...</div>
                </div>
            );
        }

        const { title, favicon, logo_title, logo_subtitle, logo, origin, } = this._getConfig();

        const { loggedIn, offchainUser, serverBusy } = this.props;
        const { state, } = this;
        const {
            email,
            name,
            passwordValid,
            nameError,
            emailHint,
            emailError,
            inviteHint,
            inviteError,
            submitting,
            cryptographyFailure,
            allBoxChecked,
        } = state;

        if (serverBusy) {
            return this._renderInvitationError();
        }

        if (cryptographyFailure) {
            return this._renderCryptoFailure();
        }

        if (loggedIn) {
            return this._renderLoggedWarning();
        }

        if (offchainUser && offchainUser.get('account')) {
            return this._renderExistingUserAccount(offchainUser.get('account'));
        }

        let emailConfirmStep = null;
        let showMailForm =
            state.step === 'sending'
            && !state.verificationWay.startsWith('social-');

        let isInviteWay = state.verificationWay === 'invite_code';

        if (state.step === 'sent' && state.verificationWay === 'email') {
            emailConfirmStep = this._renderCodeWaiting();
        } else if (state.message) {
            emailConfirmStep = (
                <div
                    className={cn('callout', {
                        success: state.step === 'verified',
                        alert: state.status === 'err',
                    })} style={{ marginTop: '1rem', marginBottom: '1rem', }}
                >
                    {state.message}
                </div>
            );
        }

        let nextStep = null;

        if (state.step === 'verified' && state.status === 'err') {
            nextStep = (
                <div className='callout alert'>
                    <strong>
                        {tt(
                            'createaccount_jsx.couldnt_create_account_server_returned_error'
                        )}:
                    </strong>
                    <p>{state.message}</p>
                </div>
            );
        }

        const okStatus = state.step === 'verified';

        const submitDisabled =
            submitting ||
            !name ||
            nameError ||
            inviteError ||
            !passwordValid ||
            !allBoxChecked ||
            !okStatus;

        const disableGetCode = okStatus || !emailHint || state.fetching;
        const disableContinueInvite = !inviteHint;

        return (
            <div>
                <Helmet>
                    <meta charSet='utf-8' />
                    <title>{title}</title>
                    <link rel='icon' type='image/png' href={favicon} sizes='16x16' />
                </Helmet>
                <Header logo={logo} title={logo_title} subtitle={logo_subtitle} logoUrl={origin} />
                <div className='CreateAccount row'>
                    <div
                        className='column'
                        style={{ maxWidth: '36rem', margin: '0 auto' }}
                    >
                        <h2>{tt('g.sign_up')}</h2>
                        <p className='CreateAccount__account-name-hint'>
                            <img src='/icons/info_o.svg' alt='' width='20' height='20' style={{  paddingRight: '3px' }}/>
                            {tt('createaccount_jsx.support')}
                            <a target='_blank' rel='noopener noreferrer' href='https://t.me/goloshelp'>{tt('createaccount_jsx.telegram')}</a>
                            {tt('createaccount_jsx.support_or')}
                            <a href={'mailto:' + SUPPORT_EMAIL}>{SUPPORT_EMAIL}</a>
                        </p>
                        <hr />
                        <form
                            onSubmit={this._onSubmit}
                            autoComplete='off'
                            noValidate
                            method='post'
                        >
                            {(showMailForm) && (
                                <div>
                                    {showMailForm && <div>
                                        <a onClick={this.onInviteEnabledChange}>{tt(isInviteWay ? 'createaccount_jsx.i_have_not_invite_code' : 'createaccount_jsx.i_have_invite_code')}
                                        </a>
                                    </div>}
                                    {isInviteWay && <div>
                                        <label>
                                            {this._renderInviteCodeField(true)}
                                        </label>
                                    </div>}
                                    {!isInviteWay && <div>
                                        <label>
                                            <span style={{ color: 'red' }}>
                                                *
                                            </span>{' '}
                                            {tt('createaccount_jsx.enter_email')}<a target='_blank' rel='noopener noreferrer' href='https://accounts.google.com/signup/v2/webcreateaccount?hl=ru&flowName=GlifWebSignIn&flowEntry=SignUp'>{tt('createaccount_jsx.here')}</a>{')'} 
                                            <input
                                                type='text'
                                                name='email'
                                                autoComplete='off'
                                                disabled={state.fetching}
                                                onChange={this.onEmailChange}
                                                value={email}
                                            />
                                            <div
                                                className={cn({
                                                    error: emailError,
                                                    success: emailHint,
                                                })}
                                            >
                                                <p>{emailError || emailHint}</p>
                                            </div>
                                        </label>
                                    </div>}
                                    {this._renderSocialButtons()}
                                </div>
                            )}
                            {emailConfirmStep}
                            {showMailForm && !isInviteWay && (
                                <div>
                                    {state.fetching
                                        && <LoadingIndicator type='circle' size='20px' inline />}
                                    <p className='CreateAccount__send-code-block'>
                                        <a
                                            className={cn('button', {
                                                disabled: disableGetCode,
                                            })}
                                            onClick={
                                                !disableGetCode
                                                    ? this.onClickSendCode
                                                    : null
                                            }
                                        >
                                            {tt('g.continue')}
                                        </a>
                                    </p>
                                </div>
                            )}
                            {showMailForm && isInviteWay && (
                                <div>
                                    <p>
                                        <a
                                            className={cn('button', {
                                                disabled: disableContinueInvite,
                                            })}
                                            onClick={
                                                !disableContinueInvite
                                                    ? this.onClickContinueInvite
                                                    : null
                                            }
                                        >
                                            {tt('g.continue')}
                                        </a>
                                    </p>
                                </div>
                            )}

                            <div className={nameError ? 'error' : ''}>
                                <label>
                                    {tt('createaccount_jsx.enter_account_name')}

                                    <div className='input-group'>
                                        <input
                                            className='input-group-field'
                                            type='text'
                                            name='name'
                                            autoComplete='off'
                                            disabled={!okStatus}
                                            onChange={this.onNameChange}
                                            value={name}
                                        />
                                    </div>

                                    <div className='CreateAccount__account-name-hint'>
                                        {tt(
                                            'createaccount_jsx.account_name_hint'
                                        )}
                                    </div>
                                </label>
                                <p>{nameError}</p>
                            </div>
                            <GeneratedPasswordInput
                                onChange={this.onPasswordChange}
                                disabled={!okStatus || submitting}
                                showPasswordString={
                                    name.length > 0 && !nameError
                                }
                            />
                            {okStatus && this._renderCaptcha()}
                            <div style={{ height: '10px' }}></div>
                            {nextStep}
                            <noscript>
                                <div className='callout alert'>
                                    <p>
                                        {tt(
                                            'createaccount_jsx.form_requires_javascript_to_be_enabled'
                                        )}
                                    </p>
                                </div>
                            </noscript>
                            {submitting && <LoadingIndicator type='circle' />}
                            <button
                                disabled={submitDisabled}
                                className={cn('button action uppercase', {
                                    disabled: submitDisabled,
                                })}
                                style={{ marginBottom: '2rem', }}
                            >
                                {tt('createaccount_jsx.create_account')}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        );
    }

    _renderExistingUserAccount(existingUserAccount) {
        const APP_NAME = tt('g.APP_NAME');

        return (
            <div className='row'>
                <div className='column'>
                    <div className='callout alert'>
                        <p>
                            {tt(
                                'createaccount_jsx.our_records_indicate_you_already_have_account',
                                { APP_NAME }
                            )}: <strong>{existingUserAccount}</strong>
                        </p>
                        <p>
                            {tt(
                                'createaccount_jsx.in_order_to_prevent_abuse_APP_NAME_can_only_register_one_account_per_user',
                                { APP_NAME }
                            )}
                        </p>
                        <p>
                            {tt(
                                'createaccount_jsx.next_3_blocks.you_can_either'
                            ) + ' '}
                            <a href='/login.html'>{tt('g.login')}</a>
                            {tt(
                                'createaccount_jsx.next_3_blocks.to_your_existing_account_or'
                            ) + ' '}
                            <a href={'mailto:' + SUPPORT_EMAIL}>
                                {tt('createaccount_jsx.send_us_email')}
                            </a>
                            {' ' +
                                tt(
                                    'createaccount_jsx.next_3_blocks.if_you_need_a_new_account'
                                )}.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    _renderCodeWaiting() {
        const { state, } = this;

        return (
            <div className='callout'>
                <div className='CreateAccount__confirm-email-block'>
                    {tt('mobilevalidation_js.enter_confirm_code')}
                    <input
                        type='email'
                        name='email'
                        autoComplete='off'
                        onChange={this.onCodeChange}
                    />
                </div>
                <div>{tt('mobilevalidation_js.waiting_from_you_line_2')}</div>


                <p>
                    <small>
                        {tt('mobilevalidation_js.you_can_change_your_number') +
                            ' '}
                        <a onClick={this.onClickSelectAnotherPhone}>
                            {tt('mobilevalidation_js.select_another_number')}
                        </a>.
                    </small>
                </p>


                <div className={cn({
                        error: state.status === 'err',
                        success: state.status === 'ok' })}>
                    <p>{state.message}</p>
                </div>

                <a
                    className={cn('button', {
                        disabled: false,
                    })}
                    onClick={this.onCheckCode}
                >
                    {tt('g.continue')}
                </a>
            </div>
        );
    }

    _renderInvitationError() {
        return (
            <div className='row'>
                <div className='column'>
                    <div className='callout alert'>
                        <p>Registration is disabled for a while. </p>
                    </div>
                </div>
            </div>
        );
    }

    _renderLoggedWarning() {
        const APP_NAME = tt('g.APP_NAME');

        return (
            <div className='row'>
                <div className='column'>
                    <div className='callout alert'>
                        <p>
                            {tt('createaccount_jsx.you_need_to')}
                            <a href='#' onClick={this._onLogoutClick}>
                                {tt('g.logout')}
                            </a>
                            {tt('createaccount_jsx.before_creating_account')}
                        </p>
                        <p>
                            {tt(
                                'createaccount_jsx.APP_NAME_can_only_register_one_account_per_verified_user',
                                { APP_NAME }
                            )}
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    _renderCryptoFailure() {
        const APP_NAME = tt('g.APP_NAME');

        return (
            <div className='row'>
                <div className='column'>
                    <div className='callout alert'>
                        <h4>
                            {tt('createaccount_jsx.ctyptography_test_failed')}
                        </h4>
                        <p>
                            {tt(
                                'createaccount_jsx.we_will_be_unable_to_create_account_with_this_browser',
                                { APP_NAME }
                            )}.
                        </p>
                        <p>
                            {tt('loginform_jsx.the_latest_versions_of') + ' '}
                            <a href='https://www.google.com/chrome/'>Chrome</a>
                            {' ' + tt('g.and')}
                            <a href='https://www.mozilla.org/en-US/firefox/new/'>
                                Firefox
                            </a>
                            {' ' +
                                tt(
                                    'loginform_jsx.are_well_tested_and_known_to_work_with',
                                    { APP_DOMAIN }
                                )}
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    _renderSocialButtons() {
        const { config } = this.state;
        if (!config || !config.grants) {
            return null;
        }
        const { grants, } = config;
        const hasGrant = (id) => {
            return grants[id] && grants[id].enabled;
        };
        const vk = hasGrant('vk');
        const facebook = hasGrant('facebook');
        const yandex = hasGrant('yandex');
        const mailru = hasGrant('mailru');
        const empty = !vk && !facebook && !yandex && !mailru;

        return (
            <div align='center'>
                {!this.state.authType && !empty && tt('createaccount_jsx.or_use_socsite')}<br/>
                {vk && <Tooltip t='VK'>
                    <span onClick={this.useVk} style={{cursor: 'pointer', marginRight: '5px' }}>
                        <img src='/images/icon-vk.png' alt='VK' />
                    </span>
                </Tooltip>}
                {facebook && <Tooltip t='Facebook'>
                    <span onClick={this.useFacebook} style={{cursor: 'pointer', marginRight: '5px' }}>
                        <img src='/images/icon-fb.png' alt='Facebook' />
                    </span>
                </Tooltip>}
                {yandex && <Tooltip t='Yandex'>
                    <span onClick={this.useYandex} style={{cursor: 'pointer', marginRight: '5px' }}>
                        <img src='/images/icon-ya.png' alt='Yandex' />
                    </span>
                </Tooltip>}
                {mailru && <Tooltip t='Mail.Ru'>
                    <span onClick={this.useMailru} style={{cursor: 'pointer', marginRight: '5px' }}>
                        <img src='/images/icon-mail.png' alt='Mail.Ru' />
                    </span>
                </Tooltip>}
            </div>
        );
    }

    _renderInviteCodeField = (required) => {
        const { state, } = this;
        const {
            invite_code,
            inviteHint,
            inviteError,
        } = state;
        return (
            <div>
                {required ? (<span style={{ color: 'red' }}>
                    *
                </span>) : null}
                {required ? ' ' : null}
                {tt(required ? 'createaccount_jsx.enter_invite_code' : 'createaccount_jsx.enter_invite_code_optional')}
                <input
                    type='text'
                    name='invite_code'
                    autoComplete='off'
                    disabled={required ? state.fetching : false}
                    onChange={this.onInviteCodeChange}
                    value={invite_code}
                />
                <div
                    className={cn({
                        error: inviteError,
                        success: inviteHint,
                    })}
                >
                    <p>{inviteError || inviteHint}</p>
                </div>
            </div>
        );
    }

    _onRecaptchaChange = (value) => {
        console.log('Captcha value:', value);
        this.setState({
            recaptcha_v2: value,
        });
    };

    _renderCaptcha = () => {
        if (!this.state.config)
            return null;
        const { captcha } = this.state.config;
        if (!captcha.recaptcha_v2 || !captcha.recaptcha_v2.enabled) {
            console.warn('captcha.recaptcha_v2 is disabled');
            return;
        }
        if (!captcha.recaptcha_v2.site_key) {
            console.warn('captcha.recaptcha_v2 has no site_key');
            return;
        }
        return (<ReCAPTCHA
            sitekey={captcha.recaptcha_v2.site_key}
            onChange={this._onRecaptchaChange} />);
    };

    _onSubmit = async e => {
        e.preventDefault();
        this.setState({ submitting: true });
        const { email, invite_code, name, password, passwordValid, referrer, recaptcha_v2, } = this.state;
        if (!name || !password || !passwordValid) return;

        let publicKeys;
        let privateKeys = {};
        try {
            const pk = PrivateKey.fromWif(password);
            publicKeys = ['owner', 'active', 'posting', 'memo'].map(role => {
                const priv = pk;
                privateKeys[role] = priv.toString();
                return priv.toPublicKey().toString();
            });
        } catch (err) {
            publicKeys = ['owner', 'active', 'posting', 'memo'].map(role => {
                const priv = PrivateKey.fromSeed(`${name}${role}${password}`);
                privateKeys[role] = priv.toString();
                return priv.toPublicKey().toString();
            });
        }

        const keyFile = new KeyFile(name, {password, ...privateKeys});

        try {
            // createAccount
            const res = await callApi('/api/reg/submit', {
                email: email !== '' ? email : undefined,
                invite_code: email === '' ? invite_code : undefined,
                name,
                owner_key: publicKeys[0],
                active_key: publicKeys[1],
                posting_key: publicKeys[2],
                memo_key: publicKeys[3],
                referrer,
                recaptcha_v2,
            });

            const data = await res.json();

            this.updateApiState(data);

            this.setState({
                submitting: false,
            });

            if (data.status === 'err') {
                console.error('CreateAccount server error', data);
            } else {
                keyFile.save();
                if (this.state.afterRedirect) {
                    window.location = this.state.afterRedirect.replace('{account}', name);
                }
            }
        } catch (err) {
            console.error('Caught CreateAccount server error', err);
            this.setState({
                status: 'err',
                error_str: err.message ? err.message : err,

                submitting: false,
            });
        }
    };

    onPasswordChange = (password, passwordValid, allBoxChecked) => {
        this.setState({ password, passwordValid, allBoxChecked });
    };

    onCodeChange = e => {
        const code = e.target.value.trim().toLowerCase();
        this.setState({ code });
    };

    validateEmail = (value, isFinal) => {
        const { config, } = this.state;

        const fakeEmailsAllowed = config && config.fake_emails_allowed;

        let emailError = null;
        let emailHint = null;

        if (!value) {
            emailError = tt('mobilevalidation_js.email_cannot_be_empty');
        } else if (!fakeEmailsAllowed && !/^[a-z0-9](\.?[a-z0-9]){5,}@g(oogle)?mail\.com$/.test(value)) {
            emailError = tt('mobilevalidation_js.email_must_be_gmail');
        }

        if (emailError) {
            emailError =
                '' + emailError;
        } else {
            emailHint = 'Google email: ' + value;
        }

        this.setState({ emailError, emailHint });
    };

    validateInviteCode = async (value, isFinal) => {
        let inviteError = null;
        let inviteHint = null;

        if (!value) {
            if (this.state.verificationWay === 'invite_code') inviteError = tt('createaccount_jsx.invite_secret_cannot_be_empty');
        } else {
            let pk;
            try {
                pk = PrivateKey.fromWif(value);
            } catch (e) {
                inviteError = tt('invites_jsx.claim_wrong_secret');
            }
            if (pk) try {
                const res = await callApi(`/api/utils/get_invite/${pk.toPublicKey().toString()}`);

                let data = await res.json();
                if (data.invite) {
                    inviteHint = tt(
                        'createaccount_jsx.invite_new_account_will_receive',
                        {amount: formatAsset(data.invite.balance, true, false, '')});
                } else {
                    inviteError = tt(
                        'invites_jsx.claim_wrong_secret_fatal'
                    );
                }
            } catch (err) {
                inviteError = tt('invites_jsx.claim_wrong_secret_cannot_fetch');
            }
        }

        this.setState({ inviteError, inviteHint });
    };

    updateApiState(res, after) {
        const { step, verification_way, error_str, } = res;

        let newState = {};

        newState.fetching = false;
        newState.status = res.status;

        if (step)
            newState.step = step;
        if (verification_way)
            newState.verificationWay = verification_way;

        newState.message = '';
        if (error_str) {
            newState.message = error_str;
        }
        if (verification_way === 'email' && step === 'verified') {
            newState.message = tt(
                'createaccount_jsx.phone_number_has_been_verified'
            );
        }

        this.setState(newState, after);
    }

    onClickSelectAnotherPhone = () => {
        this.setState({
            fetching: false,
            step: 'sending',
        });
    };

    onClickSendCode = async () => {
        const { email } = this.state;

        this.setState({
            fetching: true,
        });

        try {
            const res = await callApi('/api/reg/send_code', {
                email
            });

            let data = await res.json();

            this.updateApiState(data);
        } catch (err) {
            console.error('Caught /send_code server error', err);

            this.updateApiState({
                status: 'err',
                error_str: err.message ? err.message : err,
            });
        }
    };

    onClickContinueInvite = async () => {
        this.setState({ 
            fetching: true,
            message: '',

            email: '',
        });

        const res = await callApi('/api/reg/use_invite', {
            invite_key: PrivateKey.fromWif(this.state.invite_code).toPublicKey().toString()
        });

        let data = await res.json();

        this.updateApiState(data);
    };

    onCheckCode = async () => {
        try {
            const res = await callApi('/api/reg/verify_code', {
                confirmation_code: this.state.code,
                email: this.state.email
            });

            let data = await res.json();

            this.updateApiState(data);
        } catch (err) {
            console.error('Caught /verify_code server error:', err);
            this.updateApiState({
                status: 'err',
                error_str: err.message ? err.message : err,
            });
        }
    };

    onNameChange = e => {
        const name = e.target.value.trim().toLowerCase(); // Add prefix here
        this.validateAccountName(name);
        this.setState({ name });
    };

    async validateAccountName(name) {
        let nameError = '';

        if (name.length > 0) {
            nameError = validate_account_name(name);

            if (!nameError) {
                try {
                    const res = await callApi(`/api/utils/account_exists/${name}`);

                    let data = await res.json();
                    if (data.exists) {
                        nameError = tt(
                            'createaccount_jsx.account_name_already_used'
                        );
                    }
                } catch (err) {
                    nameError = tt('createaccount_jsx.account-name-hint');
                }
            }
        }

        this.setState({ nameError });
    }

    onEmailChange = e => {
        // продолжаем let 
        let email = e.target.value.trim().toLowerCase()
        this.validateEmail(email)

        this.setState({
            email
        });
    };

    onInviteEnabledChange = e => {
        const isInvite = this.state.verificationWay === 'invite_code';
        this.setState({
            verificationWay: isInvite ? 'email' : 'invite_code',
        });
    };

    onInviteCodeChange = e => {
        // продолжаем let 
        let invite_code = e.target.value.trim()
        this.validateInviteCode(invite_code)

        this.setState({
            invite_code
        });
    };

    _onLogoutClick = e => {
        e.preventDefault();
        this.props.logout();
    };
}



export default CreateAccount;
