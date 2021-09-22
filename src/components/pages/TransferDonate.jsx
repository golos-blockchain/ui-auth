import React from 'react';
import { Helmet } from 'react-helmet';
import { withRouter, } from 'react-router';
import tt from 'counterpart';
import Header from '../modules/Header';
import { callApi, getSession, } from '../../utils/OAuthClient';
import LoadingIndicator from '../elements/LoadingIndicator';
import AccountMenu from '../elements/AccountMenu';
import validate_account_name from '../../utils/validate_account_name';
import './TransferDonate.scss';
import golos from 'golos-classic-js';

function formatAmount(amount){
    amount = amount.replace(/[^\d.,]/g,"").replace(/,/, '.');
    return amount
}

class TransferDonate extends React.Component {
    static propTypes = {
    };

    state = {
        account: null,
        from: '',
        to: 'null',
        toError: '',
        amount: '1.234',
        amountError: '',
        memo: 'test',
        sym: 'GOLOS',
    };

    async componentDidMount() {
        const session = await getSession();
        if (!session.account) {
            window.location.href = '/login';
            return;
        }
        let res = await callApi('/api/oauth/balances/' + session.account + '/transfer');
        res = await res.json();
        this.setState({
            sign_endpoint: session.sign_endpoint,
            account: session.account,
            from: session.account,
            balances: res.balances,
            sym: Object.keys(res.balances)[0],
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
            let balance = balances[sym].split(' ')[0];;
            if (!isNaN(balance) && !amountError) {
                amountError = (parseFloat(balance) < parseFloat(amount)) ? tt('oauth_transfer.insufficient') : '';
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
        if (!balance) balance = '0.000 GOLOS';

        this.updateAmount(balance.split(' ')[0]);
    };

    onMemoChange = e => {
        let memo = e.target.value.trim().toLowerCase();

        this.setState({
            memo,
        });
    };

    _onSubmit = (e) => {
        e.preventDefault();
        const { sign_endpoint,
            from, to, amount, sym, memo, } = this.state;
        golos.config.set('websocket', sign_endpoint);
        golos.broadcast.transfer('', from, to,
            amount + ' ' + sym, memo, (err, res) => {
                console.log(err, res);
            });
    };

    compose = () => {
        let url = window.location.href.split('?')[0];
        
        const { amount, sym, to, memo, } = this.state;
        url += '?';
        url += 'to=' + to;
        url += '&amount=' + (amount || '0.000') + ' ' + sym;
        url += '&memo=' + memo;

        return tt('oauth_main_jsx.link') + url;
    };

    render() {
        const {state} = this;
        const {account, balances, sym,
            from, to, toError, amount, amountError, memo,} = this.state;
        let topRight = null;
        if (account) {
            topRight = <AccountMenu account={account} />;
        }

        let balance = balances && sym && balances[sym];
        if (!balance) balance = '0.000 GOLOS';

        let balanceOptions = [];
        if (balances)
            for (let bal of Object.keys(balances)) {
                balanceOptions.push(<option key={bal} value={bal}>{bal}</option>);
            }

        const valid = from && to && !toError && amount && !amountError;

        return (
            <div className='Login_theme'>
                <Helmet>
                    <meta charSet='utf-8' />
                    <title>{tt('oauth_main_jsx.transfer')}</title>
                </Helmet>
                <Header logo={'/icons/golos.svg'}
                    title={'GOLOS signer'}
                    titleUppercase={false}
                    logoUrl={'/'}
                    topRight={topRight} />
                <div className='Login TransferDonate row'>
                    <div
                        className='column'
                        style={{ maxWidth: '30rem', margin: '0 auto' }}
                    >
                        <h3>{tt('oauth_main_jsx.transfer')}</h3>
                        {!account && <LoadingIndicator />}
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
                                    <select onChange={this.onSymChange}>
                                        {balanceOptions}
                                    </select>
                                </span>
                            </div>
                            <a className='Balance' onClick={this.useAllBalance}>{tt('oauth_transfer.balance') + balance}</a>
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
                            <button className={'button ' + (valid ? '' : ' disabled')}>
                                {tt('oauth_transfer.submit')}
                            </button>
                            <div className='callout'>
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
