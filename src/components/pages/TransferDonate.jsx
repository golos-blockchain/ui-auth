import React from 'react';
import { Helmet } from 'react-helmet';
import { withRouter, } from 'react-router';
import tt from 'counterpart';
import Header from '../modules/Header';
import LoginForm from '../modules/LoginForm';
import { callApi, getSession, } from '../../utils/OAuthClient';
import LoadingIndicator from '../elements/LoadingIndicator';
import validate_account_name from '../../utils/validate_account_name';
import './TransferDonate.scss';
import golos from 'golos-lib-js';
import { Asset } from 'golos-lib-js/lib/utils';

function formatAmount(amount){
    amount = amount.replace(/[^\d.,]/g,"").replace(/,/, '.');
    return amount
}

class TransferDonate extends React.Component {
    static propTypes = {
    };

    state = {
        account: undefined,
        from: '',
        to: '',
        toError: '',
        amount: '',
        amountError: '',
        memo: '',
        sym: 'GOLOS',
    };

    async componentDidMount() {
        await golos.importNativeLib()
        const session = await getSession();
        if (session.oauth_disabled) {
            window.location.href = '/register';
            return;
        }
        if (!session.account) {
            this.setState({
                account: null,
            });
            return;
        }
        const { action, } = this.props;
        let res = await callApi('/api/oauth/_/balances/' + session.account + '/' + action);
        res = await res.json();
        for (const sym in res.balances) {
            res.balances[sym] = Asset(res.balances[sym]);
        }
        this.setState({
            sign_endpoint: session.sign_endpoint,
            account: session.account,
            from: session.account,
            balances: res.balances,
            sym: Object.keys(res.balances)[0],
        }, () => {
            this.uncompose();
        });
    }

    onFromChange = e => {
        let from = e.target.value.trim().toLowerCase();

        let validate = validate_account_name(from);

        this.setState({
            from,
            fromError: validate,
        });
    };

    onToChange = e => {
        let to = e.target.value.trim().toLowerCase();

        let validate = validate_account_name(to);

        this.setState({
            to,
            toError: validate,
        });
    };

    updateAmount = (amount) => {
        amount = formatAmount(amount);
        let amountError = '';

        if (!amount || parseFloat(amount) === 0) {
            amountError = tt('g.required');
        }

        const { balances, sym, } = this.state;
        if (!isNaN(amount) && balances && sym && balances[sym]) {
            let balance = balances[sym].amountFloat;
            if (!isNaN(balance) && !amountError) {
                amountError = (balance < parseFloat(amount)) ? tt('oauth_transfer.insufficient') : '';
            }
        }

        this.setState({
            amount: isNaN(amount) ? this.state.amount : amount,
            amountError,
        });
    };

    onAmountChange = e => {
        let amount = e.target.value.trim().toLowerCase();
        this.updateAmount(amount);
    };

    onSymChange = e => {
        this.setState({
            sym: e.target.value,
        }, () => {
            this.updateAmount(this.state.amount);
        })
    };

    useAllBalance = () => {
        const { balances, sym, } = this.state;
        let balance = balances && sym && balances[sym];
        if (!balance) balance = Asset(0, 3, 'GOLOS');

        this.updateAmount(balance.amountFloat.toString());
    };

    onMemoChange = e => {
        let memo = e.target.value;

        this.setState({
            memo,
        });
    };

    _onSubmit = (e) => {
        e.preventDefault();

        this.setState({
            submitting: true,
            done: false,
        })

        const { action, } = this.props;
        const { sign_endpoint,
            from, to, sym, balances, } = this.state;
        
        let amount = Asset(0, balances[sym].precision, sym);
        amount.amountFloat = parseFloat(this.state.amount);
        amount = amount.toString();

        let memo = this.state.memo;
        if (action === 'donate') {
            memo = {};
            memo.app = "golos-blog";
            memo.version = 1;
            memo.comment = this.state.memo;
            memo.target = {
                author: to,
                permlink: ""
            };
        }

        golos.config.set('websocket', sign_endpoint);
        const callback = (err, res) => {
            this.setState({
                submitting: false,
            })
            if (err) {
                alert(err);
                return;
            }
            window.close();
            this.setState({
                done: true,
            })
        };
        if (action === 'transfer')
            golos.broadcast[action]('', from, to,
                amount, memo, callback);
        else
            golos.broadcast[action]('', from, to,
                amount, memo, [], callback);
    };

    uncompose = () => {
        const params = new URLSearchParams(window.location.search);
        this.setState({
            to: params.get('to') || this.state.to,
            memo: params.get('memo') || this.state.memo,
        });
        const amountSym = params.get('amount');
        if (amountSym) {
            const [ amount, sym, ] = amountSym.split(' ');
            this.setState({
                amount,
                sym,
            });
        }
    };

    compose = () => {
        let url = window.location.href.split('?')[0];
        
        const {
            balances, sym, to, memo, } = this.state;

        if (!golos.isNativeLibLoaded() || !balances || !balances[sym])
            return '...';

        let amount = Asset(0, balances[sym].precision, sym);
        amount.amountFloat = parseFloat(this.state.amount || '0');

        url += '?';
        url += 'to=' + to;
        url += '&amount=' + amount.toString();
        url += '&memo=' + memo;

        return (<span>
                {tt('oauth_main_jsx.link')}
                <a href={url}>{url}</a>
            </span>);
    };

    render() {
        const {state} = this;
        const { done, account, balances, sym,
            from, to, toError, amount, amountError, memo,} = this.state;

        const { action, } = this.props;
        const donate = action === 'donate';

        if (account === null) {
            return (<div className='Signer_page'>
                <Helmet>
                    <meta charSet='utf-8' />
                    <title>{tt('oauth_main_jsx.' + action)} | {tt('oauth_main_jsx.title')}</title>
                </Helmet>
                <Header
                    logoUrl={'/'} />
                <LoginForm />
            </div>);
        }

        let balance = balances && sym && balances[sym];
        if (!balance) balance = Asset(0, 3, 'GOLOS');

        let balanceOptions = [];
        if (balances)
            for (let bal of Object.keys(balances)) {
                balanceOptions.push(<option key={bal} value={bal}>{bal}</option>);
            }

        const valid = from && to && !toError && amount && !amountError;

        return (
            <div className='Signer_page'>
                <Helmet>
                    <meta charSet='utf-8' />
                    <title>{tt('oauth_main_jsx.' + action)} | {tt('oauth_main_jsx.title')}</title>
                </Helmet>
                <Header
                    logoUrl={'/'}
                    account={account} />
                <div className='Signer_content TransferDonate row'>
                    <div
                        className='column'
                        style={{ maxWidth: '30rem', margin: '0 auto' }}
                    >
                        <h3>{tt('oauth_main_jsx.' + action)}</h3>
                        {!account && <LoadingIndicator type='circle' />}
                        {account ? <form
                            onSubmit={this._onSubmit}
                            autoComplete='off'
                            noValidate
                            method='post'
                        >
                            <div className='input-group'>
                                <span className='input-group-label'>@</span>
                                <input
                                    type='text'
                                    name='from'
                                    className='input-group-field'
                                    placeholder={tt('oauth_transfer.from')}
                                    autoComplete='off'
                                    disabled={true}
                                    onChange={this.onFromChange}
                                    value={from}
                                />
                            </div>
                            <div className='input-group'>
                                <span className='input-group-label'>@</span>
                                <input
                                    type='text'
                                    name='to'
                                    className='input-group-field'
                                    placeholder={tt('oauth_transfer.to')}
                                    autoComplete='off'
                                    disabled={state.submitting}
                                    onChange={this.onToChange}
                                    value={to}
                                />
                            </div>
                            <div className='error'>
                                {toError}
                            </div>
                            <div className='input-group'>
                                <input
                                    type='text'
                                    className='input-group-field'
                                    name='amount'
                                    placeholder={tt('oauth_transfer.amount')}
                                    autoComplete='off'
                                    disabled={state.submitting}
                                    onChange={this.onAmountChange}
                                    value={amount}
                                />
                                <span className='input-group-label AssetSelect'>
                                    <select value={sym} onChange={this.onSymChange}>
                                        {balanceOptions}
                                    </select>
                                </span>
                            </div>
                            <a className='Balance' onClick={this.useAllBalance}>{tt((donate ? 'oauth_donate' : 'oauth_transfer') + '.balance') + balance}</a>
                            <div className='error'>
                                {amountError}
                            </div>
                            <input
                                type='text'
                                name='memo'
                                placeholder={tt('oauth_transfer.memo')}
                                autoComplete='off'
                                disabled={state.submitting}
                                onChange={this.onMemoChange}
                                value={memo}
                            />
                            {state.submitting && <LoadingIndicator type='circle' />}
                            <button className={'button ' + (valid ? '' : ' disabled')}>
                                {tt((donate ? 'oauth_donate' : 'oauth_transfer') + '.submit')}
                            </button>
                            {done ? <span className='success done'>
                                {tt('g.done')}
                            </span> : null}
                            <div className='callout secondary page-link'>
                                {this.compose()}
                            </div>
                        </form> : null}
                    </div>
                </div>
            </div>
        );
    }
};

export default withRouter(TransferDonate);
