import React from 'react'
import tt from 'counterpart'
import cn from 'classnames'
import golos from 'golos-lib-js'
import { key_utils, PrivateKey } from 'golos-lib-js/lib/auth/ecc';

import LoadingIndicator from '@/elements/LoadingIndicator'
import AccountName from '@/elements/register/AccountName'
import VerifyWayTabs from '@/elements/register/VerifyWayTabs'
import { emptyAuthority } from '@/utils/RecoveryUtils'
import { callApi, } from '@/utils/RegApiClient'
import KeyFile from '@/utils/KeyFile'

class TransferRegister extends React.Component {
    state = {
        name: '',
        nameError: '',
        step: 1,
        loading: false,
        error: '',
    }

    componentDidMount() {
        const { clientCfg } = this.props
        golos.config.set('websocket', clientCfg.config.ws_connection_client)
        if (clientCfg.config.chain_id)
            golos.config.set('chain_id', clientCfg.config.chain_id)
    }

    goStep2 = async (e) => {
        e.preventDefault()
        let result = await callApi('/api/utils/chain_props')
        result = await result.json()

        const { name } = this.state

        const password = 'P' + key_utils.get_random_key().toWif()

        let privateKeys = {}
        let publicKeys = {};
        for (const role of ['owner', 'active', 'posting', 'memo']) {
            const priv = PrivateKey.fromSeed(`${name}${role}${password}`)
            privateKeys[role] = priv.toString()
            publicKeys[role] = priv.toPublicKey().toString()
        }

        this.setState({
            step: 2,
            min_transfer_str: result.min_transfer_str,
            password, privateKeys, publicKeys,
        })

        window.onbeforeunload = () => {
            return tt('transfer_register_jsx.unload_warning')
        }
    }

    goStep3 = async (e) => {
        e.preventDefault()

        let error = ''

        const { name, privateKeys, publicKeys } = this.state

        this.setState({ error: '', loading: true })

        try {
            const res = await callApi(`/api/utils/account_exists/${name}`);

            let data = await res.json();
            if (!data.exists) {
                error = tt('transfer_register_jsx.not_yet')
                this.setState({ error, loading: false })
                return
            }
        } catch (err) {
            console.error(err)
            error = (err.message || err)
            this.setState({ error, loading: false })
            return
        }

        try {
            let op = {}
            for (let role of ['posting','active','owner']) {
                op[role] = emptyAuthority(privateKeys[role])
            }

            let operations = []

            operations.push(['account_update', {
                account: name,
                ...op,
                memo_key: publicKeys.memo,
                json_metadata: '{}'
            }])

            await golos.broadcast.sendAsync({
                operations,
                extensions: []
            }, [privateKeys.owner])

            window.onbeforeunload = null
        } catch (err) {
            console.error(err)
            this.setState({
                error: tt('transfer_register_jsx.cannot_reset') + privateKeys.owner,
                loading: false
            })
            return
        }

        this.setState({
            error: '',
            step: 3,
            loading: false
        })
    }

    saveKeys = (e) => {
        try {
            e.preventDefault()
            const { name, password, privateKeys } = this.state

            const keyFile = new KeyFile(name, {password, ...privateKeys})
            if (this.props.afterRedirect) {
                setTimeout(() => {
                    window.location.href = this.props.afterRedirect.replace('{account}', name)
                }, 1000)
            }
            keyFile.save()
        } catch (err) {
            console.error(err)
        }
    }

    renderStep1 = () => {
        const { name, nameError, step } = this.state
        const disabled = !name || nameError
        return <div>
            <AccountName value={name} error={nameError}
                disabled={step > 1}
                onChange={name => {
                    this.setState({ name })
                }}
                onError={nameError => {
                    this.setState({ nameError })
                }}
            />
            {step === 1 ? <button
                disabled={disabled}
                className={cn('button uppercase', {
                    disabled,
                })}
                style={{ marginBottom: '2rem', }}
                onClick={this.goStep2}
            >
                {tt('g.continue')}
            </button> : null}
        </div>
    }

    renderStep2 = () => {
        const { step, min_transfer_str, name, publicKeys,
            loading, error } = this.state
        if (step !== 2) return
        return <div>
            {tt('transfer_register_jsx.please_send_transfer')}
            <b>{min_transfer_str}</b>
            {tt('transfer_register_jsx.to')}
            <b>newacc</b>
            {tt('transfer_register_jsx.with_memo') + ':'}<br/>
            <b>{name + ':' + publicKeys.owner}</b>
            <br/>
            {tt('transfer_register_jsx.you_can_use_markets')}
            <br/>
            <br/>
            {tt('transfer_register_jsx.click_check_button')}.<br/>
            <br/>
            {loading ? <LoadingIndicator type='circle' /> :
            <button className='button'
                onClick={this.goStep3}
                style={{ marginRight: '1rem' }}>
                {tt('transfer_register_jsx.check')}
            </button>}
            <span className='error'>{error}</span>
        </div>
    }

    renderStep3 = () => {
        const { step, name, password } = this.state
        if (step !== 3) return
        return <div>
            {tt('transfer_register_jsx.success')}
            {'@' + name}
            {tt('transfer_register_jsx.success2')}<br/>
            <br/>
            {tt('transfer_register_jsx.password')}<br/>
            <b>{password}</b><br/>
            <br/>
            {tt('transfer_register_jsx.save_password_please')}<br/>
            <br/>
            <button className='button'
                onClick={this.saveKeys}>
                {tt('transfer_register_jsx.save_keys')}
            </button>
        </div>
    }

    render() {
        return <form
            onSubmit={this._onSubmit}
            autoComplete='off'
            noValidate
            method='post'
        >
            <VerifyWayTabs clientCfg={this.props.clientCfg} currentWay={'transfer'} />
            {this.renderStep1()}
            {this.renderStep2()}
            {this.renderStep3()}
        </form>
    }
}

export default TransferRegister
