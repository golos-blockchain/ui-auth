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

const $STM_csrf= '1234';

function formatAsset(val) {
    return val;
}

class CreateAccount extends React.Component {
    static propTypes = {
        serverBusy: PropTypes.bool,
    };

    state = {
        fetchState: {
            checking: false,
            success: false,
            status: '',
            message: '',
            showCheckInfo: false,
        },
        fetchCounter: 0,
        phone: '',
        country: 7,
        name: '',
        email: '',
        referrer: '',
        invite_code: '',
        invite_enabled: false,
        code: '',
        password: '',
        passwordValid: '',
        nameError: '',
        emailHint: '',
        emailError: '',
        inviteHint: '',
        inviteError: '',
        codeError: '',
        codeHint: '',
        recaptcha_v2: '',
        serverError: '',
        submitting: false,
        cryptographyFailure: false,
        showRules: false,
        allBoxChecked: false,
        iSent: false,
        showHowMuchHelp: false,
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
                this.setState({referrer: invite});
            } else {
                this.setState({
                    invite_code: invite,
                    invite_enabled: true,
                }, () => {
                    this.validateInviteCode(invite);
                });
            }
        }

        let client = '';
        const query = new URLSearchParams(window.location.search);
        if (query && query.get('client')) {
            client = query.get('client');
        }

        const res = await callApi(`/api/reg/get_uid/${client}`);
        const data = await res.json();

        let theme = 'blogs';
        const config = data.config;
        const cfgclient = config && config.client;
        if (cfgclient) {
            theme = cfgclient.id;
        }
        this._applyTheme(getHost() + '/themes/' + theme + '/theme.css');

        this.setState({
            loaded: true,
            config: data.config,
        });
    }

    componentWillUnmount() {
        clearTimeout(this._timeoutId);
        clearTimeout(this._waitTimeout);
    }

    checkSocAuth = async (event) => {
        console.log('checkSocAuth');
        window.addEventListener('focus', this.checkSocAuth, {once: true});

        const response = await callApi('/api/reg/check_soc_auth');
        if (response.ok) {
            const result = await response.json();
            if (result.soc_id_type) {
                window.removeEventListener('focus', this.checkSocAuth);
                this.useSocialLogin(result.soc_id_type);
            } else if (!event) {
                setTimeout(this.checkSocAuth, 5000);
            } else {
                console.log('checkSocAuth event from focus');
            }
        }
    };

    startSocialLoading = (socName) => {
        let fetchState = {
            checking: true,
            success: true,
            status: 'done',
            message: (<div>
                <LoadingIndicator type='circle' size='20px' inline />
                {tt('createaccount_jsx.authorizing_with') + socName + '...'}
                {this._renderSocialButtons()}
            </div>),
            showCheckInfo: false,
        };
        this.setState({ fetchState, email: '', invite_enabled: false });

        this.checkSocAuth();
    };

    useSocialLogin = (socName) => {
        let fetchState = {
            checking: true,
            success: true,
            status: 'done',
            message: (<div>
                {tt('createaccount_jsx.authorized_with_') + this.state.authType + '.'}
                {this._renderSocialButtons()}
            </div>),
            showCheckInfo: false,
        };
        this.setState({ fetchState, email: '', invite_enabled: false });
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
        }

        return { title, favicon, logo_title, logo_subtitle, logo, };
    }

    render() {
        if (!this.state.loaded) {
            return (
                <div className='row'>
                    <div className='column'>{tt('g.loading')}...</div>
                </div>
            );
        }

        const { title, favicon, logo_title, logo_subtitle, logo, grants, } = this._getConfig();

        const { loggedIn, offchainUser, serverBusy } = this.props;
        const {
            fetchState,
            email,
            invite_enabled,
            name,
            passwordValid,
            nameError,
            emailHint,
            emailError,
            inviteHint,
            inviteError,
            serverError,
            submitting,
            cryptographyFailure,
            allBoxChecked,
        } = this.state;

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
            fetchState.status !== 'waiting' && fetchState.status !== 'done';

        if (fetchState.status === 'waiting') {
            emailConfirmStep = this._renderCodeWaiting();
        } else if (fetchState.message) {
            emailConfirmStep = (
                <div
                    className={cn('callout', {
                        success: fetchState.success,
                        alert: !fetchState.success,
                    })}
                >
                    {fetchState.message}
                </div>
            );
        }

        let nextStep = null;

        if (serverError) {
            if (serverError === 'Email address is not confirmed') {
                nextStep = (
                    <div className='callout alert'>
                        <a href='/enter_email'>{tt('tips_js.confirm_email')}</a>
                    </div>
                );
            } else if (serverError === 'Phone number is not confirmed') {
                nextStep = (
                    <div className='callout alert'>
                        <a href='/enter_mobile'>
                            {tt('tips_js.confirm_phone')}
                        </a>
                    </div>
                );
            } else {
                nextStep = (
                    <div className='callout alert'>
                        <strong>
                            {tt(
                                'createaccount_jsx.couldnt_create_account_server_returned_error'
                            )}:
                        </strong>
                        <p>{serverError}</p>
                    </div>
                );
            }
        }

        const okStatus = fetchState.checking && fetchState.success;

        const submitDisabled =
            submitting ||
            !name ||
            nameError ||
            inviteError ||
            !passwordValid ||
            !allBoxChecked ||
            !okStatus;

        const disableGetCode = okStatus || !emailHint || fetchState.checking;
        const disableContinueInvite = !inviteHint;

        return (
            <div>
                <Helmet>
                    <meta charSet='utf-8' />
                    <title>{title}</title>
                    <link rel='icon' type='image/png' href={favicon} sizes='16x16' />
                </Helmet>
                <Header logo={logo} title={logo_title} subtitle={logo_subtitle} />
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
                            {(showMailForm || invite_enabled) && (
                                <div>
                                    {showMailForm && <div>
                                        <a onClick={this.onInviteEnabledChange}>{tt(invite_enabled ? 'createaccount_jsx.i_have_not_invite_code' : 'createaccount_jsx.i_have_invite_code')}
                                        </a>
                                    </div>}
                                    {invite_enabled && <div>
                                        <label>
                                            {this._renderInviteCodeField(true)}
                                        </label>
                                    </div>}
                                    {!invite_enabled && <div>
                                        <label>
                                            <span style={{ color: 'red' }}>
                                                *
                                            </span>{' '}
                                            {tt('createaccount_jsx.enter_email')}<a target='_blank' rel='noopener noreferrer' href='https://accounts.google.com/signup/v2/webcreateaccount?hl=ru&flowName=GlifWebSignIn&flowEntry=SignUp'>{tt('createaccount_jsx.here')}</a>{')'} 
                                            <input
                                                type='text'
                                                name='email'
                                                autoComplete='off'
                                                disabled={fetchState.checking}
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
                            {showMailForm && !invite_enabled && (
                                <div>
                                    {fetchState.checking && <LoadingIndicator type='circle' size='20px' inline />}
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
                            {showMailForm && invite_enabled && (
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
                            {fetchState.showCheckInfo
                                ? this._renderCheckInfo()
                                : null}

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
                            {this._renderCaptcha()}
                            <br />
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
        const { codeError, codeHint, } = this.state;

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


                <div className={cn({ error: codeError, success: codeHint })}>
                    <p>{codeError || codeHint}</p>
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

    _renderCheckInfo() {
        return (
            <p className='CreateAccount__check-info'>
                {tt('createaccount_jsx.check_code')}{' '}
                <a href={'mailto:' + SUPPORT_EMAIL}>{SUPPORT_EMAIL}</a>.
            </p>
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
        const {
            fetchState,
            invite_code,
            inviteHint,
            inviteError,
        } = this.state;
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
                    disabled={required ? fetchState.checking : false}
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

    _onHowMuchClick = () => {
        this.setState({
            showHowMuchHelp: !this.state.showHowMuchHelp,
        });
    };

    _onISendClick = () => {
        this.setState({
            iSent: true,
        });
    };

    _onSubmit = async e => {
        e.preventDefault();
        this.setState({ serverError: '', submitting: true });
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
                csrf: $STM_csrf,
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

            if (data.error || data.status !== 'ok') {
                console.error('CreateAccount server error', data.error);
                this.setState({
                    serverError: data.error || tt('g.unknown'),
                    submitting: false,
                });
            } else {
                keyFile.save();
                window.location = 'https://golos.id';
                //window.location = `/login.html#account=${name}&msg=accountcreated`;
            }
        } catch (err) {
            console.error('Caught CreateAccount server error', err);
            this.setState({
                serverError: err.message ? err.message : err,
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

    onCountryChange = e => {
        const country = e.target.value.trim().toLowerCase();
        const emailHint = this.state.phone.length
            ? tt('createaccount_jsx.will_be_send_to_phone_number') +
              country +
              this.state.phone
            : '';
        this.setState({ country, emailHint });
    };

    validateEmail = (value, isFinal) => {
        let emailError = null;
        let emailHint = null;

        if (!value) {
            emailError = tt('mobilevalidation_js.email_cannot_be_empty');
        } else if (!/^[a-z0-9](\.?[a-z0-9]){5,}@g(oogle)?mail\.com$/.test(value)) {
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
            if (this.state.invite_enabled) inviteError = tt('createaccount_jsx.invite_secret_cannot_be_empty');
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

    updateFetchingState(res) {
        const fetchState = {
            checking: false,
            success: false,
            status: res.status,
            message: '',
            showCheckInfo: false,
        };

        if (res.status !== 'waiting') {
            clearTimeout(this._waitTimeout);
        }

        switch (res.status) {
            case 'select_country':
                fetchState.message = 'Please select a country code';
                break;

            case 'provide_email':
                fetchState.message = 'Please provide a correct gmail';
                break;

            case 'already_used':
                fetchState.message = tt(
                    'createaccount_jsx.this_phone_number_has_already_been_used'
                );
                break;

            case 'session':
                fetchState.message = '';
                break;

            case 'waiting':
                //fetchState.checking = true;
                fetchState.showCheckInfo = this.state.fetchState.showCheckInfo;
                fetchState.code = res.code;
                break;

            case 'done':
                fetchState.checking = true;
                fetchState.success = true;
                fetchState.message = tt(
                    'createaccount_jsx.phone_number_has_been_verified'
                );
                break;

            case 'attempts_10':
                fetchState.checking = true;
                fetchState.message = tt('mobilevalidation_js.attempts_10');
                break;

            case 'attempts_300':
                fetchState.checking = true;
                fetchState.message = tt('mobilevalidation_js.attempts_300');
                break;

            case 'error':
                fetchState.message = res.error;
                break;

            default:
                fetchState.message = tt('g.unknown');
                break;
        }

        this.setState({ fetchState });
    }

    onClickSelectAnotherPhone = () => {
        clearTimeout(this._timeoutId);
        this.setState({ fetchState: { checking: false } });
    };

    onClickSendCode = async () => {
        const { email } = this.state;

        this.setState({
            fetchCounter: 0,
            fetchState: { checking: true },
        });

        try {
            const res = await callApi('/api/reg/send_code', {
                csrf: $STM_csrf,
                email
            });

            let data = null;

            if (res.status === 200) {
                data = await res.json();
            } else {
                let message = res.status + ' ' + await res.text();

                if (res.status === 429) {
                    message += '. Please wait a moment and try again.';
                }

                data = {
                    status: 'error',
                    error: message,
                };
            }

            this.updateFetchingState(data);
        } catch (err) {
            console.error('Caught /send_code server error', err);

            this.updateFetchingState({
                status: 'error',
                error: err.message ? err.message : err,
            });
        }
    };

    onClickContinueInvite = async () => {
        let fetchState = {
            checking: true,
            success: true,
            status: 'done',
            message: '',
            showCheckInfo: false,
        };

        const res = await callApi('/api/reg/use_invite', {
            csrf: $STM_csrf,
            invite_key: PrivateKey.fromWif(this.state.invite_code).toPublicKey().toString()
        });

        if (res.status === 200) {
            fetchState.success = true;
        } else {
            let message = res.status + ' ' + await res.text();

            if (res.status === 429) {
                message += '. Please wait a moment and try again.';
            }

            fetchState.status = 'error';
            fetchState.success = false;
            fetchState.message = message;
        }
        this.setState({ fetchState, email: '' });
    };

    onCheckCode = async () => {
        try {
            const res = await callApi('/api/reg/verify_code', {
                csrf: $STM_csrf,
                confirmation_code: this.state.code,
                email: this.state.email
            });

            if (res.status === 200) {
                this.updateFetchingState({status: 'done'})
            } else {
                console.log(res.status, + res.body)
                this.setState({ codeError: res.status + ' ' + await res.text(), codeHint: '' })
            }
        } catch (err) {
            console.error('Caught /verify_code server error:', err);
            this.updateFetchingState({
                status: 'error',
                error: err.message ? err.message : err,
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
        this.setState({
            invite_enabled: !this.state.invite_enabled
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

function getHost() {
    const { location, } = window;
    if (process.env.NODE_ENV === 'development') {
        return location.protocol + '//'+ location.hostname + ':8080';
    }
    return location.origin;
}

function callApi(apiName, data) {
    return fetch(getHost() + apiName, {
        method: data ? 'post' : 'get',
        //mode: 'no-cors',
        credentials: 'include',
        headers: {
            Accept: 'application/json',
            'Content-type': data ? 'application/json' : undefined,
        },
        body: data ? JSON.stringify(data) : undefined,
    });
}

export default CreateAccount;
