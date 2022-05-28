import React from 'react'
import ReCAPTCHA from 'react-google-recaptcha'
import tt from 'counterpart'
import { Formik, Field, ErrorMessage } from 'formik'
import { PrivateKey } from 'golos-lib-js/lib/auth/ecc'

import BlogsAccountLink from '@/elements/BlogsAccountLink'
import LoadingIndicator from '@/elements/LoadingIndicator'
import { callApi, } from '@/utils/RecoveryUtils'

class RecoveryStep2 extends React.Component {
    state = {
        errorMessage: ''
    }

    validateEmail = (value) => {
        let error
        if (!value || !value.match(
            /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
        )) {
            error = tt('recovery_step2_jsx.email_error')
        }
        return error
    }

    _parseKey = (password) => {
        if (password.startsWith('P')) {
            PrivateKey.fromWif(password.substring(1)) // validates
            const { username } = this.props
            return PrivateKey.fromSeed(`${username}owner${password}`)
        } else {
            return PrivateKey.fromWif(password)
        }
    }

    validatePassword = (value) => {
        let error
        try {
            this._parseKey(value)
        } catch (err) {
            error = tt('recovery_step2_jsx.old_password_error')
        }
        return error
    }

    _onSubmit = async (values, { setSubmitting, }) => {
        this.setState({
            errorMessage: ''
        })

        const { username } = this.props
        const { captchaValue } = this.state
        const owner_public_key = this._parseKey(values.old_password).toPublic().toString()
        const request = {
            username,
            owner_public_key,
            email: values.email,
            recaptcha_v2: captchaValue
        }
        const response = await callApi('/api/recovery/request', request);
        const result = await response.json()
        if (result.status === 'ok') {
            localStorage.setItem('recovery.sent', username)
            window.location.reload()
        } else {
            this.setState({
                errorMessage: result.error_str
            })
        }
    }

    _onRecaptchaChange = (value) => {
        console.log('Captcha value:', value)
        this.setState({
            captchaValue: value
        })
    }

    _renderCaptcha = () => {
        const { captcha } = this.props.recoveryCfg
        if (!captcha && !captcha.recaptcha_v2 || !captcha.recaptcha_v2.enabled) {
            console.warn('captcha.recaptcha_v2 is disabled')
            return
        }
        if (!captcha.recaptcha_v2.site_key) {
            console.warn('captcha.recaptcha_v2 has no site_key')
            return
        }
        return (<ReCAPTCHA
            sitekey={captcha.recaptcha_v2.site_key}
            onChange={this._onRecaptchaChange} />)
    }

    render() {
        const { recoveryCfg, username, recovery_account } = this.props
        let form
        if (recovery_account === '') {
            form = <div>{tt('recovery_step2_jsx.recover_fail')}</div>
        } else {
            const { captchaValue } = this.state
            form = <Formik
                initialValues={{
                    username: ''
                }}
                onSubmit={this._onSubmit}
            >
            {({
                handleSubmit, isSubmitting, isValid, dirty, errors, touched, values, handleChange, setFieldValue,
            }) => {
                const isDisabled = !dirty || !isValid || !captchaValue
                const { errorMessage } = this.state
                return (<form
                    onSubmit={handleSubmit}
                    initialValues={{
                        email: '',
                        old_password: ''
                    }}
                    autoComplete='off'
                >
                    {tt('recovery_step2_jsx.recover_will_send')}
                    <BlogsAccountLink to={recovery_account} recoveryCfg={recoveryCfg} />.
                    <br />
                    <br />
                    <span>{tt('recovery_step2_jsx.email')}:</span>
                    <div className='input-group'>
                        <Field
                            type='text'
                            name='email'
                            className='input-group-field'
                            autoComplete='off'
                            validate={this.validateEmail}
                        />
                    </div>
                    <ErrorMessage name='email' component='div' className='error' />

                    <span>{tt('recovery_step2_jsx.old_password')}
                        <img src='/icons/info_o.svg' alt='' width='20' height='20' title={tt('recovery_step2_jsx.old_password_desc')} style={{ marginLeft: '0.5rem'}} />
                        </span>
                    <div className='input-group'>
                        <Field
                            type='password'
                            name='old_password'
                            className='input-group-field'
                            autoComplete='off'
                            validate={this.validatePassword}
                        />
                    </div>
                    <ErrorMessage name='old_password' component='div' className='error' />

                    <div style={{ marginBottom: '1rem' }}>{this._renderCaptcha()}</div>

                    {errorMessage ? <div className='error'>{errorMessage}</div> : ''}

                    {isSubmitting ? <LoadingIndicator type='circle' /> : <button className={'button' + (isDisabled ? ' disabled' : '')}
                        type='submit' disabled={isDisabled}>
                        {tt('g.submit')}
                    </button>}
                </form>)
            }}
            </Formik>
        }
        return <div>
            {tt('recovery_step2_jsx.your_account_is')}
            <BlogsAccountLink to={username} recoveryCfg={recoveryCfg} />.<br/><br/>
            {form}
        </div>
    }
}

export default RecoveryStep2
