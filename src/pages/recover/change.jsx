import React from 'react'
import tt from 'counterpart'
import golos, { api } from 'golos-lib-js'
import { Formik, Field, } from 'formik'
import Head from 'next/head'

import BlogsAccountLink from '@/elements/BlogsAccountLink'
import LoadingIndicator from '@/elements/LoadingIndicator'
import TimeAgoWrapper from '@/elements/TimeAgoWrapper'
import Header from '@/modules/Header'
import LoginForm from '@/modules/LoginForm'
import { getOAuthCfg, } from '@/server/oauth'
import { getOAuthSession, } from '@/server/oauthSession'
import { getRecoveryCfg, } from '@/server/recovery'
import { withSecureHeadersSSR, } from '@/server/security'

export const getServerSideProps = withSecureHeadersSSR(async ({ req, res, resolvedUrl, query, }) => {
    const recoveryCfg = getRecoveryCfg()
    const holder = await getOAuthSession(req, res)
    if (recoveryCfg.recoveryEnabled && holder.oauthEnabled) {
        const session = holder.session()
        if (session.account) {
            try {
                const acc = await api.getAccountsAsync([session.account])
                if (acc && acc[0] && acc[0].frozen) {
                    return await holder.freeze(session.account)
                }
            } catch (err) {}
        }
        return {
            props: {
                recoveryCfg,
                oauthCfg: getOAuthCfg(),
                session,
            },
        }
    }
    return await holder.clearAndRedirect()
})

class RecoverChange extends React.Component {
    state = {
    }

    async load() {
        const { session } = this.props
        if (session.account) {
            this.setState({ loading: true })

            let initial = {
                owner_key: '',
                new_recovery_account: ''
            }

            let request
            let info = await api.getRecoveryInfo({ accounts: [session.account], fill: ['change_partner'] })
            if (info) {
                info = info[session.account]
                initial.new_recovery_account = (info && info.recovery_account) || ''
                request = (info && info.change_partner_request) || request
            }

            this.setState({
                loading: false,
                initial,
                request
            })
        } else {
            this.setState({
                loading: false,
            })
        }
    }

    componentDidMount() {
        const { recoveryCfg, session } = this.props
        const { ws_connection_client, } = recoveryCfg
        golos.config.set('websocket', ws_connection_client)
        if (recoveryCfg.chain_id) {
            golos.config.set('chain_id', recoveryCfg.chain_id)
        }
        this.load()
    }

    componentDidUpdate(prevProps) {
        const { session } = this.props
        if (session.account !== prevProps.session.account) {
            this.load()
        }
    }

    _onSubmit = async (values, { setSubmitting, }) => {
        this.setState({
            errorMessage: null,
            done: false,
        })
        const { session } = this.props

        let auths = {};
        try {
            auths = await golos.auth.login(session.account, values.owner_key)
        } catch (err) {
            console.error(err)
            this.setState({
                errorMessage: err.message || err
            })
            setSubmitting(false)
            return
        }

        if (!auths.owner)  {
            this.setState({
                errorMessage: tt('recovery.wrong_password')
            })
            setSubmitting(false)
            return
        }

        try {
            let res = await golos.broadcast.changeRecoveryAccountAsync(auths.owner, session.account,
                values.new_recovery_account, [])
        } catch (err) {
            console.error(err)
            this.setState({
                errorMessage: err.message || err
            })
            setSubmitting(false)
            return
        }

        setSubmitting(false)
        this.setState({
            done: true
        })
    }

    render() {
        const { oauthCfg, session, } = this.props
        const { account, } = session
        const { loading, done, errorMessage, request, initial } = this.state

        if (account === null) {
            return (<div className='Signer_page'>
                <Head>
                    <meta charSet='utf-8' />
                    <title>{tt('recovery.recovery_account')} | {tt('oauth_main_jsx.title')}</title>
                </Head>
                <Header
                    logoUrl={'/'} />
                <LoginForm oauthCfg={oauthCfg} session={session} />
            </div>)
        }

        let form = null
        if (initial) form = (<Formik
                initialValues={initial}
                onSubmit={this._onSubmit}
            >
            {({
                handleSubmit, isSubmitting, isValid, dirty, errors, touched, values, handleChange, setFieldValue,
            }) => {
                let isDisabled = (isSubmitting || !values.new_recovery_account)
                if (!request && !dirty) isDisabled = true
                return (<form
                    onSubmit={handleSubmit}
                    autoComplete='off'
                >
                    <br />
                    <span>{tt('recovery.owner_key')}:</span>
                    <div className='input-group'>
                        <Field
                            type='password'
                            name='owner_key'
                            className='input-group-field'
                            autoComplete='off'
                        />
                    </div>
                    {!request ? <div>
                        <span>{tt('recovery.recovery_account')}:</span>
                        <div className='input-group'>
                            <span className='input-group-label'>@</span>
                            <Field
                                type='text'
                                name='new_recovery_account'
                                className='input-group-field'
                                autoComplete='off'
                            />
                        </div>
                    </div> : null}

                    {errorMessage ? <div className='error'>{errorMessage}</div> : ''}

                    {isSubmitting && <LoadingIndicator type='circle' />}
                    <button className={'button' + (isDisabled ? ' disabled' : '') + 
                        (request ? ' alert' : '')}
                        type='submit' disabled={isDisabled}>
                        {tt(request ? 'g.cancel' : 'g.save')}
                    </button>
                    {done ? <span className='success done'>
                        {tt('g.done')}
                    </span> : null}
                </form>)
            }}
            </Formik>)

        let description
        if (request) {
            const { recoveryCfg } =this.props
            description = <div>
                {tt('recovery.request_exists')}
                <BlogsAccountLink recoveryCfg={recoveryCfg} to={request.recovery_account} />.<br/>
                {tt('recovery.request_exists2')}
                <TimeAgoWrapper date={request.effective_on} />.<br/>
                {tt('recovery.request_exists3')}.
            </div>
        } else {
            description = <div>
                <div>{tt('recovery.change_desc')}</div>
                <br/>
                <div>{tt('recovery.change_desc2')}</div>
            </div>
        }

        return (<div className='Signer_page'>
            <Head>
                <meta charSet='utf-8' />
                <title>{tt('recovery.recovery_account')} | {tt('oauth_main_jsx.title')}</title>
            </Head>
            <Header
                logoUrl={'/'}
                account={account} />
            <div className='Signer_content TransferDonate row'>
                <div
                    className='column'
                    style={{ maxWidth: '40rem', margin: '0 auto' }}
                >
                    <h3>{tt('recovery.change_title')}</h3>
                    {description}
                    {(loading) && <LoadingIndicator type='circle' />}
                    {form}
                </div>
            </div>
        </div>)
    }
}

export default RecoverChange
