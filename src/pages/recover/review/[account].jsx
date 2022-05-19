import React from 'react'
import tt from 'counterpart'
import golos, { auth, broadcast } from 'golos-lib-js'
import Head from 'next/head'
import { key_utils } from 'golos-lib-js/lib/auth/ecc';

import BlogsAccountLink from '@/elements/BlogsAccountLink'
import Header from '@/modules/Header'
import LoginForm from '@/modules/LoginForm'
import { getOAuthCfg, } from '@/server/oauth'
import { getOAuthSession, } from '@/server/oauthSession'
import { getRecoveryCfg, } from '@/server/recovery'
import { withSecureHeadersSSR, } from '@/server/security'
import { wifToPublic } from '@/utils/RecoveryUtils'

export const getServerSideProps = withSecureHeadersSSR(async ({ req, res, params, }) => {
    const recoveryCfg = getRecoveryCfg()
    const holder = await getOAuthSession(req, res)
    if (recoveryCfg.recoveryEnabled && holder.oauthEnabled) {
        const session = holder.session()
        return {
            props: {
                recoveryCfg,
                oauthCfg: getOAuthCfg(),
                session,
                recovering: params.account
            },
        }
    }
    return await holder.clearAndRedirect()
})

class RecoverReview extends React.Component {
    state = {
        tmp_owner: key_utils.get_random_key().toWif(),
    }

    _onClick = async (e) => {
        e.preventDefault()

        const { recovering, session, oauthCfg } = this.props
        const { account, } = session
        const { sign_endpoint, } = oauthCfg

        golos.config.set('websocket', sign_endpoint)
        golos.config.set('credentials', 'include')
        try {
            const ownerKey = wifToPublic(this.state.tmp_owner)
            const newOwnerAuthority = {weight_threshold: 1, account_auths: [], key_auths: [[ownerKey, 1]]}
            await broadcast.requestAccountRecoveryAsync('', account, recovering, newOwnerAuthority, [])
        } catch (err) {
            this.setState({errorMessage: err.message || err})
            return
        }
        this.setState({done: true})
    }

    render() {
        const { oauthCfg, session, recovering } = this.props
        const { account, } = session
        const { tmp_owner, errorMessage, done } = this.state

        if (account === null) {
            return (<div className='Signer_page'>
                <Head>
                    <meta charSet='utf-8' />
                    <title>{tt('recovery_review.title')} | {tt('oauth_main_jsx.title')}</title>
                </Head>
                <Header
                    logoUrl={'/'} />
                <LoginForm oauthCfg={oauthCfg} session={session} />
            </div>)
        }

        const { recoveryCfg } =this.props
        const link = <BlogsAccountLink recoveryCfg={recoveryCfg} to={recovering} />

        return (<div className='Signer_page'>
            <Head>
                <meta charSet='utf-8' />
                <title>{tt('recovery_review.title')} | {tt('oauth_main_jsx.title')}</title>
            </Head>
            <Header
                logoUrl={'/'}
                account={account} />
            <form>
                <div className='Signer_content TransferDonate row'>
                    <div
                        className='column'
                        style={{ maxWidth: '30rem', margin: '0 auto' }}
                    >
                        <h3>{tt('recovery_review.title')}</h3>

                        {link}{tt('recovery_review.desc')}<br/><br/>

                        {tt('recovery_review.desc2')}{link}{tt('recovery_review.desc3')}<br/><br/>

                        {tt('recovery_review.tmp_owner')}<br/>
                        <input type='text' readOnly value={tmp_owner} />
                        {tt('recovery_review.tmp_owner2')}<br/><br/>

                        {tt('recovery_review.tmp_owner3')}
                        <b>{tt('recovery_review.tmp_owner4')}</b>
                        <br/><br/>

                        {errorMessage && <div className='error'>{errorMessage}</div>}

                        {done ? <span className='success done'>
                            {tt('recovery_review.done')}
                        </span> : <button className='button alert' onClick={this._onClick}>{tt('recovery_review.accept')}</button>}
                    </div>
                </div>
            </form>
        </div>)
    }
}

export default RecoverReview
