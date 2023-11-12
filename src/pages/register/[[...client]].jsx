import React from 'react';
import PropTypes from 'prop-types';
import tt from 'counterpart';
import cn from 'classnames';
import { PrivateKey, } from 'golos-lib-js/lib/auth/ecc';
import Head from 'next/head';
import ReCAPTCHA from 'react-google-recaptcha';
import TelegramLoginButton from 'react-telegram-login'

import { SUPPORT_EMAIL } from '@/client_config';
import GeneratedPasswordInput from '@/elements/GeneratedPasswordInput';
import LoadingIndicator from '@/elements/LoadingIndicator';
import AccountName from '@/elements/register/AccountName'
import CryptoFailure from '@/elements/register/CryptoFailure'
import VerifyWayTabs from '@/elements/register/VerifyWayTabs'
import Tooltip from '@/elements/Tooltip';
import Header from '@/modules/Header';
import TransferRegister from '@/modules/register/TransferRegister'
import UIARegister from '@/modules/register/UIARegister'
import { obtainUid, getClientCfg, getDailyLimit, } from '@/server/reg';
import { initRegSession, } from '@/server/regSession';
import { withSecureHeadersSSR, } from '@/server/security';
import KeyFile from '@/utils/KeyFile';
import { callApi, } from '@/utils/RegApiClient';
import validate_account_name from '@/utils/validate_account_name';

export const getServerSideProps = withSecureHeadersSSR(async ({ req, res, params, }) => {
    await initRegSession(req, res);
    let clientCfg = getClientCfg(req, params, tt.getLocale());
    obtainUid(req);
    await req.session.save();
    return {
        props: {
            client: params.client || null,
            clientCfg,
            dailyLimit: getDailyLimit()
        },
    };
})

function formatAsset(val) {
    return val;
}

class Register extends React.Component {
    state = {
        fetching: false,
        step: 'sending',
        verificationWay: 'social',
        message: '',

        name: '',
        referrer: '',
        invite_code: '',
        code: '',
        password: '',
        passwordValid: '',
        nameError: '',
        inviteHint: '',
        inviteError: '',
        recaptcha_v2: '',
        submitting: false,
        cryptographyFailure: false,
        allBoxChecked: false,
    };

    processQuery = () => {
        const params = new URLSearchParams(window.location.search)
        const invite = params.get('invite')
        if (invite || params.has('invite')) {
            if (!validate_account_name(invite)) {
                console.log('Referrer account will be', invite);
                if (this.state.referrer !== invite)
                    this.setState({referrer: invite});
            } else {
                const verificationWay = 'invite_code'
                if (this.state.verificationWay !== verificationWay) {
                    this.setState({
                        verificationWay,
                    })
                }
                if (invite && this.state.invite_code !== invite) {
                    this.setState({
                        invite_code: invite,
                    }, () => {
                        this.validateInviteCode(invite);
                    })
                }
            }
        } else if (params.has('transfer')) {
            const verificationWay = 'transfer'
            if (this.state.verificationWay !== verificationWay)
                this.setState({
                    verificationWay,
                })
        } else if (params.has('uia')) {
            const verificationWay = 'uia'
            if (this.state.verificationWay !== verificationWay)
                this.setState({
                    verificationWay,
                })
        } else {
            const verificationWay = 'social'
            if (!this.state.verificationWay.startsWith(verificationWay))
                this.setState({
                    verificationWay,
                })
        }
    }

    async componentDidMount() {
        const cryptoTestResult = undefined;
        if (cryptoTestResult !== undefined) {
            console.error(
                'Register - cryptoTestResult: ',
                cryptoTestResult
            );
            this.setState({ cryptographyFailure: true });
        }

        this.processQuery()

        let data = this.props.clientCfg;

        console.log('Auth service version:', data.version);

        const config = data.config;
        const cfgclient = config && config.client;

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
            config: data.config,
            oauthEnabled: data.oauthEnabled,
            afterRedirect,
        }, () => {
            console.log('afterRedirect is', this.state.afterRedirect);
        });
    }

    componentDidUpdate() {
        this.processQuery()
    }

    checkSocAuth = async (event) => {
        window.addEventListener('focus', this.checkSocAuth, {once: true});

        const response = await callApi('/api/reg/check_soc_auth');
        if (response.ok || response.status === 400) {
            const result = await response.json();
            if (result.soc_id_type || result.error) {
                window.removeEventListener('focus', this.checkSocAuth);
                this.useSocialLogin(result, result.soc_id_type)
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
                <span style={{ display: 'inline-block', marginTop: '0.35rem', marginLeft: '0.5rem' }}>
                    {tt('register_jsx.authorizing_with') + socName + '...'}
                </span>
                {this._renderSocialButtons(false)}
            </div>),
        });

        this.checkSocAuth();
    };

    useSocialLogin = (result, socIdType) => {
        let socName = 'unknown'
        if (socIdType) {
            socIdType = socIdType.split('_')[0]
            if (socIdType === 'vk') {
                socName = 'ВКонтакте'
            } else if (socIdType === 'facebook') {
                socName = 'Facebook'
            }  else if (socIdType === 'mailru') {
                socName = 'Mail.Ru'
            }  else if (socIdType === 'yandex') {
                socName = 'Яндекс'
            }  else if (socIdType === 'telegram') {
                socName = 'Telegram'
            } 
        }

        this.updateApiState(result, () => {
            if (result.error) {
                this.setState({
                    verificationWay: 'social' // to show social buttons again
                })
            } else {
                this.setState({
                    fetching: false,
                    message: (<div>
                        {tt('register_jsx.authorized_with_') + socName + '.'}
                        {this._renderSocialButtons(false)}
                    </div>),
                    verificationWay: 'social-' + socName,
                })
            }
        })
    };

    useVk = (e) => {
        e.preventDefault();
        const authType = 'ВКонтакте'
        this.setState({
            authType
        });
        this.startSocialLoading(authType);
        window.open(`/api/reg/modal/vk`, '_blank');
    };

    useFacebook = (e) => {
        e.preventDefault();
        const authType = 'Facebook'
        this.setState({
            authType
        });
        this.startSocialLoading(authType);
        window.open(`/api/reg/modal/facebook`, '_blank');
    };

    useMailru = (e) => {
        e.preventDefault();
        const authType = 'Mail.Ru'
        this.setState({
            authType
        });
        this.startSocialLoading(authType);
        window.open(`/api/reg/modal/mailru`, '_blank');
    };

    useTelegram = (e) => {
        e.preventDefault();
        const authType = 'Telegram'
        this.setState({
            authType
        })
        this.startSocialLoading(authType)
        window.open(`/api/reg/modal/telegram`, '_blank');
    };

    useYandex = (e) => {
        e.preventDefault();
        const authType = 'Яндекс'
        this.setState({
            authType
        });
        this.startSocialLoading(authType);
        window.open(`/api/reg/modal/yandex`, '_blank');
    };

    _getConfig() {
        let title = tt('register_jsx.title_default');
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
                favicon = '/themes/' + config.client.id + '/' + client.favicon;            
            }
            // - They will be null if not set in client
            logo_title = client.logo_title;
            logo_subtitle = client.logo_subtitle;
            // -
            logo = client.logo ?
                '/themes/' + config.client.id + '/' + client.logo
                : logo;
            origin = config.client.origin || origin;
        }

        return { title, favicon, logo_title, logo_subtitle, logo, origin, };
    }

    _renderThemeCss = () => {
        let data = this.props.clientCfg;
        let theme = 'blogs';
        const config = data.config;
        const cfgclient = config && config.client;
        if (cfgclient) {
            theme = cfgclient.id;
        }
        return (<link
                href={'/themes/' + theme + '/theme.css'}
                type='text/css'
                rel='stylesheet'
                media='screen,print'
            />);
    };

    render() {
        const { title, favicon, logo_title, logo_subtitle, logo, origin, } = this._getConfig();

        const { state, } = this;
        const {
            name,
            passwordValid,
            nameError,
            inviteHint,
            inviteError,
            submitting,
            cryptographyFailure,
            allBoxChecked,
            oauthEnabled,
        } = state;

        if (cryptographyFailure) {
            return <CryptoFailure />
        }

        let socialConfirmStep = null;
        let showMailForm =
            state.step === 'sending'
            && !state.verificationWay.startsWith('social-');

        let isInviteWay = state.verificationWay === 'invite_code';

        if (state.message) {
            socialConfirmStep = (
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
                            'register_jsx.couldnt_create_account_server_returned_error'
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

        const disableContinueInvite = !inviteHint;

        let form
        if (state.verificationWay === 'transfer') {
            form = <TransferRegister
                clientCfg={this.props.clientCfg}
                afterRedirect={this.state.afterRedirect}
            />
        } else if (state.verificationWay === 'social') {
            const { dailyLimit } = this.props
            if (dailyLimit.limit && dailyLimit.limit.exceed) {
                form = <div>
                    <VerifyWayTabs currentWay='social' />
                    <div className='callout alert'>
                        {tt('register_jsx.email_exceed')}
                    </div>
                </div>
            }
        } else if (state.verificationWay === 'uia' && state.step !== 'verified') {
            form = <UIARegister
                clientCfg={this.props.clientCfg}
                afterRedirect={this.state.afterRedirect}
                updateApiState={this.updateApiState}
            />
        }

        form = form || (<form
            onSubmit={this._onSubmit}
            autoComplete='off'
            noValidate
            method='post'
        >
            {(showMailForm) && (
                <div>
                    {showMailForm && <VerifyWayTabs currentWay={state.verificationWay} />}
                    {isInviteWay && <div>
                        <label>
                            {this._renderInviteCodeField(true)}
                        </label>
                    </div>}
                    {!isInviteWay && this._renderSocialButtons(!(state.verificationWay === 'social'), !(state.verificationWay === 'social'))}
                </div>
            )}
            {socialConfirmStep}
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

            <AccountName value={name} error={nameError}
                disabled={!okStatus}
                onChange={name => {
                    this.setState({ name })
                }}
                onError={nameError => {
                    this.setState({ nameError })
                }}
            />

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
                            'register_jsx.form_requires_javascript_to_be_enabled'
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
                {tt('register_jsx.create_account')}
            </button>
        </form>)

        return (
            <div>
                <Head>
                    <meta charSet='utf-8' />
                    <title>{title}</title>
                    <link rel='icon' type='image/png' href={favicon} sizes='16x16' />
                    {this._renderThemeCss()}
                </Head>
                <Header logo={logo} title={logo_title} subtitle={logo_subtitle} logoUrl={origin} topRight={oauthEnabled ? undefined : <span></span>} />
                <div className='Register row'>
                    <div
                        className='column'
                        style={{ maxWidth: '36rem', margin: '0 auto' }}
                    >
                        <h2>{tt('g.sign_up')}</h2>
                        <p className='Register__account-name-hint'>
                            <img src='/icons/info_o.svg' alt='' width='20' height='20' style={{  paddingRight: '3px' }}/>
                            {tt('register_jsx.support')}
                            <a target='_blank' rel='noopener noreferrer' href='https://t.me/goloshelp'>{tt('register_jsx.telegram')}</a>
                            {tt('register_jsx.support_or')}
                            <a href={'mailto:' + SUPPORT_EMAIL}>{SUPPORT_EMAIL}</a>
                        </p>
                        <hr />
                        {form}
                    </div>
                </div>
            </div>
        );
    }

    onTelegramAuth = async (user) => {
        let dataAuthUrl = '/api/reg/modal/telegram/callback?'
        for (const [k, v] of Object.entries(user)) {
            dataAuthUrl += k + '=' + v + '&'
        }
        const response = await callApi(dataAuthUrl);
        if (response.ok || response.status === 400) {
            const result = await response.json();
            this.setState({
                authType: 'Telegram',
            }, () => {
                this.useSocialLogin(result, result.soc_id_type)
            })
        }
    }

    _renderSocialButtons(showTitle = true, center = true) {
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
        const telegram = hasGrant('telegram')
        const empty = !vk && !facebook && !yandex && !mailru && !telegram

        const { dailyLimit } = this.props

        if (!this.state.authType && !empty) {
            if (dailyLimit.limit && dailyLimit.limit.exceed) {
                return null
            }
        }

        return (
            <div align={center ? 'center' : ''}>
                {showTitle && !this.state.authType && !empty && tt('register_jsx.or_use_socsite')}
                {showTitle ? <br /> : null}
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
                {telegram && !showTitle && <div style={{ marginTop: '0.5rem' }}>
                    {tt('register_jsx.or_use_telegram')}
                </div>}
                {telegram && <div style={{ marginTop: '0.5rem' }}>
                    <TelegramLoginButton botName='testgolos2_bot'
                        buttonSize='medium'
                        dataOnauth={this.onTelegramAuth}
                        usePic={false} />
                </div>}
                {dailyLimit.limit ? <div style={{ marginTop: '0.25rem', marginBottom: '0.5rem' }}>
                    {tt('register_jsx.free_remain')}
                    {tt('register_jsx.free_remain2', {
                        count: dailyLimit.limit.per_day - dailyLimit.limit.regs.length
                    })}
                </div> : null}
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
                {tt(required ? 'register_jsx.enter_invite_code' : 'register_jsx.enter_invite_code_optional')}
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
        const { verificationWay, invite_code, name, password, passwordValid, referrer, recaptcha_v2, } = this.state;
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
            let res
            // create account
            if (this.state.verificationWay === 'uia') {
                res = await callApi('/api/reg/submit_uia', {
                    name,
                    owner_key: publicKeys[0],
                    active_key: publicKeys[1],
                    posting_key: publicKeys[2],
                    memo_key: publicKeys[3],
                    recaptcha_v2,
                })
            } else {
                res = await callApi('/api/reg/submit', {
                    invite_code: verificationWay === 'invite_code' ? invite_code : undefined,
                    name,
                    owner_key: publicKeys[0],
                    active_key: publicKeys[1],
                    posting_key: publicKeys[2],
                    memo_key: publicKeys[3],
                    referrer,
                    recaptcha_v2,
                })
            }

            const data = await res.json();

            this.updateApiState(data);

            if (data.status === 'err') {
                console.error('Register server error', data);
                this.setState({
                    submitting: false,
                })
            } else {
                if (this.state.afterRedirect) {
                    setTimeout(() => {
                        window.location.href = this.state.afterRedirect.replace('{account}', name)
                    }, 1000)
                }
                keyFile.save()
            }
        } catch (err) {
            console.error('Caught Register server error', err);
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

    validateInviteCode = async (value, isFinal) => {
        let inviteError = null;
        let inviteHint = null;

        if (!value) {
            if (this.state.verificationWay === 'invite_code') inviteError = tt('register_jsx.invite_secret_cannot_be_empty');
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
                        'register_jsx.invite_new_account_will_receive',
                        {amount: data.account_will_receive_str});
                } else {
                    inviteError = data.error_str || tt(
                        'invites_jsx.claim_wrong_secret_fatal'
                    )
                }
            } catch (err) {
                inviteError = tt('invites_jsx.claim_wrong_secret_cannot_fetch');
            }
        }

        this.setState({ inviteError, inviteHint });
    };

    updateApiState = (res, after) => {
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
        if (verification_way === 'social' && step === 'verified') {
            newState.message = tt(
                'register_jsx.phone_number_has_been_verified'
            );
        }

        this.setState(newState, after);
    }

    onClickContinueInvite = async () => {
        this.setState({ 
            fetching: true,
            message: '',
        });

        const res = await callApi('/api/reg/use_invite', {
            invite_key: PrivateKey.fromWif(this.state.invite_code).toPublicKey().toString()
        });

        let data = await res.json();

        this.updateApiState(data);
    };

    onInviteCodeChange = e => {
        // продолжаем let 
        let invite_code = e.target.value.trim()
        this.validateInviteCode(invite_code)

        this.setState({
            invite_code
        });
    };
}



export default Register;
