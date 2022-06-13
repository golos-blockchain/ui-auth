import React from 'react'
import { Formik, Field, ErrorMessage, } from 'formik'
import Head from 'next/head'
import tt from 'counterpart'
import golos from 'golos-lib-js'

import { withSecureHeadersSSR, } from '@/server/security'
import { getOAuthCfg, } from '@/server/oauth'
import { getOAuthSession, } from '@/server/oauthSession'
import LoadingIndicator from '@/elements/LoadingIndicator'
import Header from '@/modules/Header'

export const getServerSideProps = withSecureHeadersSSR(async ({ req, res, params, query, }) => {
    const holder = await getOAuthSession(req, res)
    if (!holder.oauthEnabled) {
        return await holder.clearAndRedirect()
    }
    const session = holder.session();
    let initial = {
        account: params.acc ? params.acc[0] : ''
    }
    return {
        props: {
            oauthCfg: getOAuthCfg(),
            session,
            initial,
        },
    }
})

class Unfreeze extends React.Component {
    state = {
    }

    _onSubmit = async (values, { setSubmitting, setErrors, }) => {
        const { oauthCfg, } = this.props
        const { sign_endpoint, } = oauthCfg

        golos.config.set('websocket', sign_endpoint)
        golos.config.set('credentials', 'include')

        this.setState({
            frozen: false
        })

        let acc = null
        try {
            acc = await golos.api.getAccountsAsync([values.account])
        } catch (err) {
            setErrors({ account: err.message || err })
            return
        }

        if (!acc[0]) {
            setErrors({ account: tt('unfreeze_jsx.account_not_found') })
            return
        }

        if (!acc[0].frozen) {
            setErrors({ account: tt('unfreeze_jsx.not_frozen') })
            return
        }

        let props = null
        try {
            props = await golos.api.getChainPropertiesAsync()
        } catch (err) {
            setErrors({ account: err.message || err })
            return
        }

        this.setState({
            frozen: values.account,
            fee: props.account_creation_fee
        })
    }

    _renderFrozen() {
        const { frozen, fee } = this.state

        const link = <a href={'/sign/transfer?to=' + frozen + '&amount=' + fee + '&memo='}
                target='_blank' rel='noopener noreferrer'>
            {tt('unfreeze_jsx.frozen3')}
        </a>

        return <div style={{marginTop: '1rem'}}>
            {tt('unfreeze_jsx.frozen')}
            <b>{fee}</b>
            {tt('unfreeze_jsx.frozen2')}
            {link}
        </div>
    }

    render() {
        const { oauthCfg, session, initial, } = this.props
        const { account, } = session
        const { frozen } = this.state

        const form = (<Formik
            initialValues={initial}
            onSubmit={this._onSubmit}
        >
        {({
            handleSubmit, isSubmitting, isValid, dirty, errors, touched, values, handleChange, setFieldValue,
        }) => (
            <form
                onSubmit={handleSubmit}
                autoComplete='off'
            >
                <div className='input-group'>
                    <span className='input-group-label'>@</span>
                    <Field
                        type='text'
                        name='account'
                        className='input-group-field'
                        autoComplete='off'
                    />
                </div>
                <ErrorMessage name='account' component='div' className='error' />

                {isSubmitting && <LoadingIndicator type='circle' />}
                <button className={'button ' + ((isSubmitting || !values.account) ? ' disabled' : '')}
                    type='submit' disabled={isSubmitting || !values.account}>
                    {tt('recovery.continue')}
                </button>

                {frozen ? this._renderFrozen() : null}
            </form>
        )}
        </Formik>)

        return (<div className='Signer_page'>
            <Head>
                <meta charSet='utf-8' />
                <title>{tt('oauth_main_jsx.unfreeze')} | {tt('oauth_main_jsx.title')}</title>
            </Head>
            <Header
                logoUrl={'/'}
                account={account} />
            <div className='Signer_content TransferDonate row'>
                <div
                    className='column'
                    style={{ maxWidth: '30rem', margin: '0 auto' }}
                >
                    <h3>{tt('oauth_main_jsx.unfreeze')}</h3>
                    {form}
                </div>
            </div>
        </div>);
    }
}

export default Unfreeze
