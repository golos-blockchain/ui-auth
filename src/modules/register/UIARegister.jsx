import React from 'react'
import CopyToClipboard from 'react-copy-to-clipboard'
import tt from 'counterpart'
import cn from 'classnames'
import golos, { api, } from 'golos-lib-js'
import { Asset, AssetEditor } from 'golos-lib-js/lib/utils';
import { key_utils, PrivateKey } from 'golos-lib-js/lib/auth/ecc'
import Link from 'next/link'
import { Formik, ErrorMessage, } from 'formik'

import LoadingIndicator from '@/elements/LoadingIndicator'
import AmountField from '@/elements/forms/AmountField'
import AccountName from '@/elements/register/AccountName'
import VerifyWayTabs from '@/elements/register/VerifyWayTabs'
import TransferWaiter from '@/modules/register/TransferWaiter'
import { apidexGetPrices } from '@/utils/ApidexApiClient'
import KeyFile from '@/utils/KeyFile'
import { delay, } from '@/utils/misc'
import { emptyAuthority } from '@/utils/RecoveryUtils'
import { callApi, } from '@/utils/RegApiClient'
import { withRouterHelpers, } from '@/utils/routing'

function getAssetMeta(asset) {
    let sym
    try {
        sym = asset.supply && asset.supply.split(' ')[1]
    } catch (err) {
        console.warn(err)
    }
    let res = {}
    try {
        let obj = JSON.parse(asset.json_metadata)
        if (typeof(obj) === 'object' && obj && !Array.isArray(obj)) {
            res = obj
        }
    } catch (err) {
    }
    if (sym === 'GOLOS') {
        res.image_url = '/images/golos.png'
    } else if (sym === 'GBG') {
        res.image_url = '/images/gold-golos.png'
    }
    return res
}

class APIError extends Error {
    constructor(errReason, errData) {
        super('API Error')
        this.reason = errReason
        this.data = errData
    }
}

class UIARegister extends React.Component {
    state = {
        loading: true,
        error: '',
    }

    constructor(props) {
        super(props)
    }

    async componentDidMount() {
        const { clientCfg } = this.props

        golos.config.set('websocket', clientCfg.config.ws_connection_client)
        if (clientCfg.config.chain_id)
            golos.config.set('chain_id', clientCfg.config.chain_id)

        const { apidex_service } = clientCfg.config
        const { uias } = clientCfg.config.registrar
        const syms = uias.assets

        const path = this.getPath()
        if (path[1]) {
            const params = new URLSearchParams(path[1])
            const sym = params.get('uia')
            if (sym) {
                let assets
                assets = await golos.api.getAssetsAsync('', syms)

                let error
                if (!syms.includes(sym)) {
                    error = sym + tt('uia_register_jsx.no_such_asset')
                } else {
                    for (const asset of assets) {
                        const supply = Asset(asset.supply)
                        const symbol = supply.symbol
                        if (sym === symbol) {
                            const meta = getAssetMeta(asset)
                            const { deposit, telegram } = meta
                            if (deposit.unavailable) {
                                error = sym + tt('uia_register_jsx.deposit_unavailable')
                                break
                            }

                            const accName = clientCfg.config.registrar.account
                            let registrar = await golos.api.getAccounts([accName])
                            registrar = registrar[0]

                            const { to_type, to_api, fee, } = deposit
                            if (fee && (isNaN(fee) || parseFloat(fee) !== 0)) {
                                error = sym + tt('uia_register_jsx.transfer_not_supported')
                                break
                            }
                            if (to_type === 'transfer') {
                                error = sym + tt('uia_register_jsx.transfer_not_supported')
                                break
                            }

                            let minAmount = Asset(0, supply.precision, supply.symbol)

                            let cmc
                            try {
                                cmc = await apidexGetPrices(apidex_service, sym)
                                if (!cmc.price_usd) {
                                    console.error('Cannot obtain price_usd', cmc)
                                    throw Error('Cannot obtain price_usd')
                                }
                                const priceUsd = parseFloat(cmc.price_usd)
                                let minFloat = 1 / priceUsd
                                if (minFloat >= 0.99 && minFloat < 1) {
                                    minFloat = 1
                                }

                                minAmount.amountFloat = minFloat.toString()
                            } catch (err) {
                                console.error(err)
                                error = sym + tt('uia_register_jsx.cmc_error')
                                break
                            }

                            const min_amount = parseFloat(deposit.min_amount)
                            if (min_amount != NaN) {
                                const minAmountRules = Asset(0, supply.precision, supply.symbol)
                                minAmountRules.amountFloat = min_amount.toString()
                                if (minAmountRules.gt(minAmount)) {
                                    minAmount = minAmountRules
                                }
                            }

                            for (let i = 0; i < 3; ++i) {
                                try {
                                    let fp = await callApi('/api/reg/get_free_poller/' + minAmount.toString())
                                    fp = await fp.json()
                                    if (fp.error) {
                                        throw new Error(fp.error)
                                    }
                                    minAmount = Asset(fp.amount)
                                    error = null
                                    break
                                } catch (err) {
                                    console.error('get_free_poller', err)
                                    error = tt('uia_register_jsx.free_poller')
                                }
                                await delay(2000)
                            }

                            this.setState({
                                rules: { ...deposit, creator: asset.creator, telegram },
                                minAmount,
                                initialForm: {
                                    amount: AssetEditor(minAmount),
                                },
                                registrar,
                                sym,
                                copied_addr: false,
                                copied_memo: false,
                            }, () => {
                                try {
                                    this._onAmountChange(minAmount)
                                } catch (err) {
                                    console.error(err)
                                }
                                if (to_type === 'api') {
                                    this.doAPI()
                                }
                            })
                            break
                        }
                    }
                }

                this.setState({
                    loading: false,
                    assets,
                    sym,
                    error
                })
                return
            }
        }

        let assets = []
        if (syms.length) {
            assets = await golos.api.getAssetsAsync('', syms)
        }
        this.setState({
            loading: false,
            assets,
            error: null
        })
    }

    getPath = () => {
        const { router } = this.props
        let path = (router.asPath.split('#')[0])
        return path.split('?')
    }

    doReq = async (acc, sym) => {
        const url = '/api/reg/uia_address/' + sym + '/' + acc
        let res = await callApi(url)
        res = await res.json()
        return res
    }

    async doAPI() {
        const { clientCfg } = this.props

        const { sym, registrar, } = this.state

        try {
            const acc = registrar.name
            let retried = 0
            const retryReq = async () => {
                let res = await this.doReq(acc, sym)
                if (res.status === 'err') {
                    if (retried < 3 &&
                        (res.error === 'too_many_requests'
                            || res.error === 'cannot_connect_gateway')) {
                        console.error('Repeating /uia_address', res)
                        ++retried
                        await delay(1100)
                        await retryReq()
                        return
                    }
                    throw new APIError(res.error, res.error_data)
                }

                this.setState({
                    apiLoaded: {
                        address: res.address
                    }
                })
            }
            await retryReq()
        } catch (err) {
            console.error('/uia_address', err)
            if (err instanceof APIError) {
                this.setState({
                    apiLoaded: {
                        error: err.reason,
                        errData: err.data
                    }
                })
            } else {
                this.setState({
                    apiLoaded: {
                        error: 'error_on_golos_blockchain_side',
                    }
                })
            }
        }
    }

    balanceValue = () => {
        const { registrar, } = this.state
        if (registrar) {
            return registrar.balance
        }
        return '0.000 GOLOS'
    }

    enoughBalance = () => {
        return Asset(this.balanceValue()).gte(Asset('0.001 GOLOS'));
    }

    _renderTo = (to, to_fixed, username) => {
        let addr = to || to_fixed;
        if (username)
            addr = <span className='overflow-ellipsis'>{addr}</span>
        return addr ? <div>
            {tt('uia_register_jsx.to')}<br/>
            <span style={{wordWrap: 'break-word', color: '#4BA2F2', fontSize: '120%'}}>
                {addr}
            </span> 
            <CopyToClipboard text={addr} onCopy={() => this.setState({copied_addr: true})}>
                <span style={{cursor: 'pointer', paddingLeft: '5px'}}>
                    <img src='/icons/copy.svg' alt='' width='32' height='32' />
                    {this.state.copied_addr ? <img src='/icons/copy_ok.svg' alt='' width='20' height='20' /> : null}
                </span>
            </CopyToClipboard>
            <br/>
            </div> : null;
    }

    _renderParams = () => {
        const { rules, sym, registrar, minAmount, waiting } = this.state
        const username = registrar.name
        const { memo_fixed } = rules
        let details = rules.details
        if (memo_fixed) {
            details = details.split('<account>').join(username)
        }
        return <div style={{fontSize: "90%"}}>
            {waiting && <hr />}
            {waiting && details && <div style={{ whiteSpace: 'pre-line', }}>
                {details}
            <br/><br/></div>}
            {!waiting && minAmount && <div>
                {tt('uia_register_jsx.min_amount')} <b>{minAmount.floatString}</b>.</div>}
        </div>;
    }

    _renderApi = () => {
        const { sym, apiLoaded, waiting } = this.state
        if (!apiLoaded) {
            return (<div>
                <br />
                <center>
                    <LoadingIndicator type='circle' size='70px' />
                </center>
                <br />
            </div>);
        }
        if (apiLoaded.error) {
            const { rules } = this.state
            let { creator, telegram } = rules
            if (telegram) {
                telegram = 'https://t.me/' + encodeURIComponent(telegram)
                telegram = <a href={telegram} target='_blank' rel='nofollow noreferrer' style={{ marginLeft: '6px' }}>
                    <img src='/icons/telegram.svg' title='Telegram' width='20' height='20' />
                </a>
            }
            return (<div>
                {tt('uia_register_jsx.api_error') + sym + ':'}
                <p style={{marginTop: '0.3rem', marginBottom: '0.3rem'}}>
                    <b>{creator}</b>{telegram}
                </p>
                {tt('uia_register_jsx.api_error_details')}
                <pre style={{marginTop: '0.3rem'}}>
                    {apiLoaded.error}
                    {'\n'}
                    {apiLoaded.errData ? JSON.stringify(apiLoaded.errData) : null}
                </pre>
            </div>)
        }
        const { address } = apiLoaded
        return (<div>
            {waiting && this._renderTo(address, null)}
            {this._renderParams(false)}
            {waiting ? this._renderWaiter() : this._renderForm()}
        </div>)
    }

    _renderWaiter = () => {
        const { waitAmount, registrar, onTransfer } = this.state
        if (!onTransfer) {
            onTransfer = async (deposited) => {
                let order_receipts
                try {
                    let mor = await callApi('/api/reg/make_order_receipt/' + deposited.toString() + '/true')
                    mor = await mor.json()
                    if (mor.status !== 'ok' || mor.error) {
                        throw new Error(mor.error || 'Unknown error')
                    }

                    order_receipts = mor.order_receipts
                    this.setState({
                        deposited,
                        depositedToSym: order_receipts[0][1].split(' ')[1]
                    })
                } catch (err) {
                    console.error(err)
                    this.setState({
                        deposited,
                        error: err.message || err.toString()
                    })
                    return
                }

                while (order_receipts.length) {
                    let error
                    for (let tr = 1; tr <= 10; ++tr) {
                        try {
                            let orr = await callApi('/api/reg/place_order', {})
                            orr = await orr.json()
                            if (orr.status === 'ok') {
                                console.log(orr)
                                if (orr.order_receipts && orr.order_receipts[0]) {
                                    order_receipts = orr.order_receipts
                                    this.setState({
                                        depositedToSym: order_receipts[0][1].split(' ')[1]
                                    })
                                } else {
                                    this.props.updateApiState(orr)
                                    return
                                }
                                break
                            }
                            console.error('place_order', orr)
                            throw new Error(orr.error)
                        } catch (err) {
                            console.error('place_order throws', err)
                            error = (err && err.toString) && err.toString()
                        }
                        await delay(3000)
                    }

                    if (error) {
                        this.setState({
                            error: tt('uia_register_jsx.cannot_place_order') + error
                        })
                        break
                    }
                }
            }
        }
        return <div>
            <div style={{ fontSize: '90%', marginTop: '0.5rem', marginBottom: '0.25rem' }}>
                {tt('uia_register_jsx.enter_amount')}<span style={{ fontSize: '130%' }}><b>{waitAmount.floatString}</b></span>
            </div>
            <TransferWaiter
                username={registrar.name}
                amount={waitAmount} title={''} onTransfer={onTransfer} />
        </div>
    }

    amountValidate = async (values) => {
        const errors = {}
        const { minAmount } = this.state
        if (values.amount.asset.lt(minAmount)) {
            errors.amount = tt('uia_register_jsx.min_amount') + minAmount.floatString
        }
        this.setState({
            amountSubmitError: ''
        })

        if (!errors.amount) {
            try {
                let fp = await callApi('/api/reg/make_order_receipt/' + values.amount.asset.toString() + '/false')
                fp = await fp.json()
                let receive
                if (fp.error) {
                    errors.amount = fp.error
                } else {
                    receive = await Asset(fp.result)

                    const cprops = await golos.api.getChainPropertiesAsync()
                    let { create_account_min_golos_fee } = cprops
                    create_account_min_golos_fee = await Asset(create_account_min_golos_fee)
                    if (create_account_min_golos_fee.gt(receive)) {
                        errors.amount = tt('uia_register_jsx.too_low_amount_to_register')
                    }
                }
                if (receive)
                    this.setState({
                        receive,
                    })
            } catch (err) {
                console.error(err)
                errors.amount = 'Internal error'
                return
            }
        }

        return errors
    }

    _onAmountChange = async (amount, form) => {
    }

    _onAmountSubmit = async (values) => {
        const waitAmount = values.amount.asset
        try {
            let fp = await callApi('/api/reg/get_free_poller/' + waitAmount.toString())
            fp = await fp.json()
            if (fp.status !== 'ok') {
                throw new Error(fp.error || 'Unknown error')
            }
            if (fp.amount !== waitAmount.toString()) {
                throw new Error('Slot is used')
            }
        } catch (err) {
            this.setState({
                amountSubmitError: err.message === 'Slot is used' ? tt('uia_register_jsx.slot_is_used') : err.message
            })
            return
        }
        this.setState({
            waiting: true,
            waitAmount
        })
    }

    _renderForm = () => {
        const { initialForm, amountSubmitError, receive } = this.state
        return <Formik
            initialValues={initialForm}
            validate={this.amountValidate}
            onSubmit={this._onAmountSubmit}
            validateOnMount={true}
        >
        {({
            handleSubmit, isSubmitting, isValid, dirty, errors, touched, values, handleChange, setFieldValue, setFieldError,
        }) => {
            return (
                <form
                    onSubmit={handleSubmit}
                    autoComplete='off'
                >
                    <div style={{ fontSize: '90%', marginTop: '0.5rem', marginBottom: '0.25rem' }}>
                        {tt('uia_register_jsx.enter_amount')}
                    </div>
                    <div className='input-group'>
                        <AmountField
                            name='amount'
                            className='input-group-field'
                            onChange={this._onAmountChange}
                        />
                    </div>
                    {errors.amount && <div className='error'>{errors.amount}</div>}
                    {amountSubmitError && <div className='error'>{amountSubmitError}</div>}
                    {!errors.amount && !amountSubmitError && receive ? <div style={{marginBottom:'0.5rem'}}>
                        {tt('uia_register_jsx.you_will_receive')}<b>~{receive.floatString}.</b>
                    </div> : null}

                    {isSubmitting && <LoadingIndicator type='circle' />}
                    <button className={'button ' + (isSubmitting || !isValid ? ' disabled' : '')}
                        type='submit' disabled={isSubmitting || !isValid}>
                        {tt('g.continue')}
                    </button>
                </form>
            )
        }}
        </Formik>
    }

    render() {
        let content

        const { loading, error } = this.state

        if (loading) {
            content = <LoadingIndicator type='circle' />
        } else {
            const { assets, sym, waiting } = this.state

            const path = this.getPath()[0]

            let syms = []
            for (const asset of assets) {
                const meta = getAssetMeta(asset)
                if (meta.deposit) {
                    const symbol = Asset(asset.supply).symbol
                    const displaySym = symbol.startsWith('YM') ? symbol.substring(2) : symbol
                    syms.push(<a href={path + '?uia=' + symbol} key={symbol}>
                        <div className={'uia' + (symbol === sym ? ' selected' : '')}>
                            <img src={meta.image_url} />
                            {displaySym}
                        </div>
                    </a>)
                }
            }

            let form
            if (error) {
                form = <div className='error'>{error}</div>
            } else if (sym) {
                const { deposited, depositedToSym } = this.state
                if (deposited) {
                    form = <div>
                        <center>
                            {tt('uia_register_jsx.deposited')}
                            <b>{deposited.floatString}</b>
                            {tt('uia_register_jsx.deposited2_SYM', {
                                SYM: depositedToSym || 'GOLOS'
                            })}
                            <br />
                            <LoadingIndicator type='circle' />
                        </center>
                    </div>
                } else {
                    const { rules, registrar, } = this.state
                    const { to, to_type, to_fixed, details, } = rules
                    if (to_type === 'api') {
                        form = this._renderApi()
                    } else {
                        let memo_fixed = rules.memo_fixed
                        if (memo_fixed) {
                            const username = registrar.name
                            memo_fixed = memo_fixed.split('<account>').join(username)
                        }
                        form = <div>
                            {waiting && this._renderTo(to, to_fixed)}
                            {(waiting && memo_fixed) ? <div>
                                    {tt('uia_register_jsx.memo_fixed')}:<br/>
                                    <span style={{wordWrap: 'break-word', color: '#4BA2F2', fontSize: '120%'}}>
                                        {memo_fixed}
                                    </span> 
                                    <CopyToClipboard text={memo_fixed} onCopy={() => this.setState({copied_memo: true})}>
                                        <span style={{cursor: 'pointer', paddingLeft: '5px'}}>
                                            <img src='/icons/copy.svg' alt='' width='32' height='32' /> {this.state.copied_memo ? <img src='/icons/copy_ok.svg' alt='' width='20' height='20' /> : null}
                                        </span>
                                    </CopyToClipboard>
                                    <br/>
                                </div> : null}
                            {this._renderParams()}
                            {waiting ? this._renderWaiter() : this._renderForm()}
                        </div>
                    }
                }
            }

            content = <div>
                {syms}
                {this.state.sym && <hr />}
                {form}
            </div>
        }

        return <div className='UIARegister'>
            <VerifyWayTabs currentWay={'uia'} />
            {content}
        </div>
    }
}

export default withRouterHelpers(UIARegister)
