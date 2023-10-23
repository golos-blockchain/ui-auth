import React from 'react'
import CopyToClipboard from 'react-copy-to-clipboard'
import tt from 'counterpart'
import cn from 'classnames'
import golos, { api, broadcast } from 'golos-lib-js'
import { Asset } from 'golos-lib-js/lib/utils';
import { key_utils, PrivateKey } from 'golos-lib-js/lib/auth/ecc'
import Link from 'next/link'

import LoadingIndicator from '@/elements/LoadingIndicator'
import AccountName from '@/elements/register/AccountName'
import VerifyWayTabs from '@/elements/register/VerifyWayTabs'
import TransferWaiter from '@/modules/register/TransferWaiter'
import KeyFile from '@/utils/KeyFile'
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

const TransferState = {
    initial: 0,
    transferring: 1,
    waiting: 2,
    received: 3,
    timeouted: 4,
};

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

    async componentDidMount() {
        const { clientCfg } = this.props

        golos.config.set('websocket', clientCfg.config.ws_connection_client)
        if (clientCfg.config.chain_id)
            golos.config.set('chain_id', clientCfg.config.chain_id)

        const { uias } = clientCfg.config.registrar

        const path = this.getPath()
        if (path[1]) {
            const params = new URLSearchParams(path[1])
            const sym = params.get('uia')
            if (sym) {
                let assets
                assets = await golos.api.getAssetsAsync('', uias)

                let error
                if (!uias.includes(sym)) {
                    error = sym + tt('uia_register_jsx.no_such_asset')
                } else {
                    for (const asset of assets) {
                        const symbol = Asset(asset.supply).symbol
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

                            const { to_type, to_api, } = deposit
                            if (to_type === 'transfer') {
                                /*clearOldAddresses();
                                const addr = loadAddress(sym, asset.creator);
                                if (addr) {
                                    this.setState({
                                        transferState: TransferState.received,
                                        receivedTransfer: {
                                            memo: addr,
                                        },
                                    });
                                }*/
                            }

                            this.setState({
                                transferState: TransferState.initial,
                                rules: { ...deposit, creator: asset.creator, telegram },
                                registrar,
                                sym,
                                copied_addr: false,
                                copied_memo: false,
                            }, () => {
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
        if (uias.length) {
            assets = await golos.api.getAssetsAsync('', uias)
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
                        await new Promise(resolve => setTimeout(resolve, 1100))
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

    transfer = async () => {
        this.setState({
            transferState: TransferState.transferring,
        }, () => {
            this.transferAndWait()
        })
    }

    waitingTimeout = (10 + 1) * 60 * 1000

    transferAndWait = async () => {
        const { sym, rules, registrar } = this.state
        const { to_transfer, memo_transfer, } = rules
        let stopper
        let stopStream = api.streamOperations((err, op) => {
            if (op[0] === 'transfer' && op[1].from === to_transfer
                && op[1].to === registrar.name) {
                stopStream();
                clearTimeout(stopper);
                saveAddress(sym, rules.creator, op[1].memo);
                this.setState({
                    transferState: TransferState.received,
                    receivedTransfer: op[1],
                });
            }
        })

        try {
            const res = await broadcast.transferAsync(registrar.name, to_transfer, '0.001 GOLOS', memo_transfer)
        } catch (err) {
            console.error(err)
            this.setState({
                transferState: TransferState.initial,
            })
            stopStream()
            return
        }

        this.setState({
            transferState: TransferState.waiting,
        });
        stopper = setTimeout(() => {
            if (stopStream) stopStream();
            this.setState({
                transferState: TransferState.timeouted,
            })
        }, this.waitingTimeout)
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
        const { rules, sym, registrar } = this.state
        const username = registrar.name
        const { min_amount, fee, memo_fixed } = rules
        let details = rules.details
        if (memo_fixed) {
            details = details.split('<account>').join(username)
        }
        return <div style={{fontSize: "90%"}}>
            <hr />
            {details && <div style={{ whiteSpace: 'pre-line', }}>
                {details}
            <br/><br/></div>}
            {min_amount && <div>
                {tt('uia_register_jsx.min_amount')} <b>{min_amount} {sym || ''}</b></div>}
            {fee && <div>
                {tt('uia_register_jsx.fee') + ': '}<b>{fee} {sym || ''}</b></div>}
        </div>;
    }

    _renderApi = () => {
        const { sym, apiLoaded  } = this.state
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
            {this._renderTo(address, null)}
            {this._renderParams(false)}
            {this._renderWaiter()}
        </div>)
    }

    _renderTransfer = () => {
        const { rules, sym, transferState, receivedTransfer, } = this.state
        const { to_transfer, memo_transfer, } = rules

        const transferring = transferState === TransferState.transferring

        const enough = this.enoughBalance()

        if (transferState === TransferState.received) {
            const { registrar, } = this.state
            const { memo, } = receivedTransfer;
            return (<div>
                {this._renderTo(receivedTransfer.memo, null, registrar.name)}
                {this._renderParams(false)}
            </div>);
        }

        if (transferState === TransferState.timeouted) {
            return (<div>
                {tt('asset_edit_deposit_jsx.timeouted')}
                {sym || ''}
                .
            </div>);
        }

        if (transferState === TransferState.waiting) {
            return (<div>
                {tt('asset_edit_deposit_jsx.waiting')}
                <br />
                <br />
                <center>
                    <LoadingIndicator type='circle' size='70px' />
                </center>
                <br />
            </div>);
        }

        return (<div>
            {tt('uia_register_jsx.transfer_desc')}
            <b>{to_transfer || ''}</b>
            {tt('uia_register_jsx.transfer_desc_2')}
            <b>{memo_transfer || ''}</b>
            {transferring ?
                <span><LoadingIndicator type='circle' /></span> : null}
            <button type='submit' disabled={!enough || transferring} className='button float-center' onClick={this.transfer}>
                {tt('g.submit')}
            </button>
            {!enough ? <div className='error'>
                {tt('transfer_jsx.insufficient_funds')}
            </div> : null}
            {this._renderParams()}
        </div>);
    }

    _renderWaiter = () => {
        const { sym, registrar, onTransfer } = this.state
        if (!onTransfer) {
            onTransfer = (delta) => {
                this.setState({
                    deposited: delta
                })
            }
        }
        return <TransferWaiter
            username={registrar.name}
            sym={sym} title={''} onTransfer={onTransfer} />
    }

    render() {
        let content

        const { loading, error } = this.state

        if (loading) {
            content = <LoadingIndicator type='circle' />
        } else {
            const { assets, sym } = this.state

            const path = this.getPath()[0]

            let syms = []
            for (const asset of assets) {
                const meta = getAssetMeta(asset)
                if (meta.deposit) {
                    const symbol = Asset(asset.supply).symbol
                    syms.push(<a href={path + '?uia=' + symbol} key={symbol}>
                        <div className={'uia' + (symbol === sym ? ' selected' : '')}>
                            <img src={meta.image_url} />
                            {symbol}
                        </div>
                    </a>)
                }
            }

            let form
            if (error) {
                form = <div className='error'>{error}</div>
            } else if (sym) {
                const { deposited } = this.state
                if (deposited) {
                    form = <div>
                        <center>
                        {!embed ? <h4>
                            {tt('asset_edit_deposit_jsx.transfer_title_SYM', {
                                SYM: sym || ' ',
                            })}
                        </h4> : null}
                        <br /><br />
                        {tt('asset_edit_deposit_jsx.you_received')}
                        <b>{deposited.toString()}</b>. {tt('asset_edit_deposit_jsx.you_received2')}
                        </center>
                    </div>
                } else {
                    const { rules, registrar, } = this.state
                    const { to, to_type, to_fixed, to_transfer,
                        min_amount, fee, details, } = rules
                    if (to_type === 'api') {
                        form = this._renderApi()
                    } else if (to_type === 'transfer') {
                        form = this._renderTransfer()
                    } else {
                        let memo_fixed = rules.memo_fixed
                        if (memo_fixed) {
                            const username = registrar.name
                            memo_fixed = memo_fixed.split('<account>').join(username)
                        }
                        form = <div>
                            {this._renderTo(to, to_fixed)}
                            {memo_fixed ? <div>
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
                            {this._renderWaiter()}
                        </div>
                    }
                }
            }

            content = <div>
                {this.state.sym ? <h4>{tt('uia_register_jsx.register_with')}</h4> :
                <h4>{tt('uia_register_jsx.select_uia')}</h4>}
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
