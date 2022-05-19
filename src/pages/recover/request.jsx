import React from 'react'
import tt from 'counterpart'
import golos, { api } from 'golos-lib-js'
import { Formik, Field, } from 'formik'
import Head from 'next/head'

import LoadingIndicator from '@/elements/LoadingIndicator'
import Header from '@/modules/Header'
import EnterName from '@/modules/recover/EnterName'
import NotifyingPartner from '@/modules/recover/NotifyingPartner'
import WaitingOwnerReset from '@/modules/recover/WaitingOwnerReset'
import OwnerReset from '@/modules/recover/OwnerReset'
import WaitingFinalReset from '@/modules/recover/WaitingFinalReset'
import FinalReset from '@/modules/recover/FinalReset'
import { getOAuthCfg, oauthEnabled, } from '@/server/oauth'
import { getRecoveryCfg, } from '@/server/recovery'
import { withSecureHeadersSSR, } from '@/server/security'
import { STEPS, callApi } from '@/utils/RecoveryUtils'

export const getServerSideProps = withSecureHeadersSSR(async ({ req, res, resolvedUrl, query, }) => {
    const recoveryCfg = getRecoveryCfg()
    if (recoveryCfg.recoveryEnabled && oauthEnabled()) {
        return {
            props: {
                recoveryCfg,
                oauthCfg: getOAuthCfg(),
            },
        }
    }
    return await holder.clearAndRedirect()
})

class RecoverRequest extends React.Component {
    state = {
        step: STEPS.EnterName,
        errorMessage: ''
    }

    constructor(props) {
        super(props)
        const sent = typeof(localStorage) !== 'undefined' && localStorage.getItem('recovery.sent')
        if (sent) {
            this.state.step = STEPS.WaitingOwnerReset
            this.state.loading = true
            this.state.username = sent
        }
    }

    async componentDidMount() {
        if (typeof(window) === 'undefined') {
            return
        }
        const { recoveryCfg, session } = this.props
        const { ws_connection_client, } = recoveryCfg
        golos.config.set('websocket', ws_connection_client)
        if (recoveryCfg.chain_id) {
            golos.config.set('chain_id', recoveryCfg.chain_id);
        }
        let { step } = this.state
        if (step >= STEPS.WaitingOwnerReset) {
            const { username } = this.state
            const response = await callApi('/api/recovery/request/' + username)
            const result = await response.json()
            const { recovery_account, recovery_request, can_retry } = result
            if (!recovery_request) {
                if (result.recovered_owner) {
                    if (result.can_update_owner_now) {
                        const { json_metadata } = result
                        step = STEPS.FinalReset
                        this.setState({
                            loading: false,
                            step,
                            new_owner_authority: result.owner_authority,
                            json_metadata
                        })
                    } else {
                        step = STEPS.WaitingFinalReset
                        this.setState({
                            loading: false,
                            step,
                            waitUntil: result.next_owner_update_possible
                        })
                    }
                } else {
                    step = STEPS.WaitingOwnerReset
                    this.setState({
                        loading: false,
                        step,
                        recovery_account,
                        waitUntil: can_retry.wait_until
                    })
                }
            } else {
                const { new_owner_authority } = recovery_request
                step = STEPS.OwnerReset
                this.setState({
                    loading: false,
                    step,
                    recovery_account,
                    new_owner_authority
                })
            }
        }
    }

    toStep = (step, stateData = undefined) => {
        this.setState({
            step,
            ...stateData
        })
    }

    render() {
        const { recoveryCfg } = this.props
        const { loading, step, username, recovery_account, waitUntil,
            new_owner_authority, json_metadata } = this.state

        let form = null
        if (loading) {
            form = <LoadingIndicator type='circle' />
        } else if (step === STEPS.EnterName) {
            form = <EnterName toStep={this.toStep} />
        } else if (step === STEPS.NotifyingPartner) {
            form = <NotifyingPartner
                recoveryCfg={recoveryCfg} username={username}
                recovery_account={recovery_account}
            />
        } else if (step === STEPS.WaitingOwnerReset) {
            form = <WaitingOwnerReset
                recoveryCfg={recoveryCfg} username={username}
                recovery_account={recovery_account} waitUntil={waitUntil}
            />
        } else if (step === STEPS.OwnerReset) {
            form = <OwnerReset
                recoveryCfg={recoveryCfg} username={username}
                new_owner_authority={new_owner_authority}
            />
        } else if (step === STEPS.WaitingFinalReset) {
            form = <WaitingFinalReset
                waitUntil={waitUntil}
            />
        } else if (step === STEPS.FinalReset) {
            form = <FinalReset
                recoveryCfg={recoveryCfg} username={username}
                new_owner_authority={new_owner_authority}
                json_metadata={json_metadata}
            />
        }

        return (<div className='Signer_page'>
            <Head>
                <meta charSet='utf-8' />
                <title>{tt('recovery.recovery_account')} | {tt('oauth_main_jsx.title')}</title>
            </Head>
            <Header
                logoUrl={'/'}
                topRight={<span></span>} />
            <div className='Signer_content TransferDonate row'>
                <div
                    className='column'
                    style={{ maxWidth: '40rem', margin: '0 auto' }}
                >
                    <h3>{tt('recovery.recover_title')}</h3>
                    {form}
                </div>
            </div>
        </div>)
    }
}

export default RecoverRequest
