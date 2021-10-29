import React from 'react';
import { Helmet } from 'react-helmet';
import { withRouter, } from 'react-router';
import tt from 'counterpart';
import golos from 'golos-lib-js';
import { Asset } from 'golos-lib-js/lib/utils';
import { Formik, Field, ErrorMessage, } from 'formik';
import Header from '../modules/Header';
import LoginForm from '../modules/LoginForm';
import { callApi, getSession, } from '../../utils/OAuthClient';
import LoadingIndicator from '../elements/LoadingIndicator';
import validate_account_name from '../../utils/validate_account_name';
import './TransferDonate.scss';

class TransferDonate extends React.Component {
    static propTypes = {
    };

    state = {
        account: undefined,
        initial: undefined,
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
        let initial = {
            from: session.account,
            to: '',
            amount: '',
            sym: Object.keys(res.balances)[0],
        };
        this.uncompose(initial);
        this.setState({
            sign_endpoint: session.sign_endpoint,
            account: session.account,
            balances: res.balances,
            initial,
        });
    }

    onToChange = (e, handle) => {
        let value = e.target.value.trim().toLowerCase();
        e.target.value = value;
        return handle(e);
    };

    onAmountChange = (e, values, handle) => {
        let value = e.target.value.trim().toLowerCase();
        if (isNaN(value) || parseFloat(value) < 0) {
            e.target.value = values.amount || '';
            return;
        }
        e.target.value = value;
        return handle(e);
    };

    useAllBalance = (e, sym, setFieldValue) => {
        const { balances, } = this.state;
        let balance = balances && sym && balances[sym];
        if (!balance) balance = Asset(0, 3, 'GOLOS');

        setFieldValue('amount', balance.amountFloat.toString());
    };

    validate = (values) => {
        const errors = {};
        if (!values.to) {
            errors.to = tt('g.required');
        } else {
            const err = validate_account_name(values.to);
            if (err) errors.to = err;
        }

        if (!values.amount) {
            errors.amount = tt('g.required');
        } else if (parseFloat(values.amount) === 0) {
            errors.amount = tt('g.required');
        } else {
            const { balances, } = this.state;
            const { amount, sym, } = values;
            if (!isNaN(amount) && balances && sym && balances[sym]) {
                let balance = balances[sym].amountFloat;
                if (!isNaN(balance) && balance < parseFloat(amount)) {
                    errors.amount = tt('oauth_transfer.insufficient');
                }
            }
        }

        return errors;
    };

    _onSubmit = (values, { setSubmitting, }) => {
        this.setState({
            done: false,
        })

        const { action, } = this.props;
        const { sign_endpoint, balances, } = this.state;
        const { from, to, sym, } = values;

        let amount = Asset(0, balances[sym].precision, sym);
        amount.amountFloat = parseFloat(values.amount);
        amount = amount.toString();

        let memo = values.memo || '';
        if (action === 'donate') {
            memo = {};
            memo.app = "golos-blog";
            memo.version = 1;
            memo.comment = values.memo || '';
            memo.target = {
                author: to,
                permlink: ""
            };
        }

        golos.config.set('websocket', sign_endpoint);
        golos.config.set('credentials', 'include');
        const callback = (err, res) => {
            setSubmitting(false);
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

    uncompose = (initial) => {
        const params = new URLSearchParams(window.location.search);
        initial.to = params.get('to') || initial.to;
        initial.memo = params.get('memo') || initial.memo;
        const amountSym = params.get('amount');
        if (amountSym) {
            const [ amount, sym, ] = amountSym.split(' ');
            initial.amount = amount;
            initial.sym = sym;
        }
    };

    compose = (values) => {
        let url = window.location.href.split('?')[0];

        const { balances, } = this.state;
        const { sym, to, memo, } = values;

        if (!golos.isNativeLibLoaded() || !balances || !balances[sym])
            return '...';

        let amount = Asset(0, balances[sym].precision, sym);
        amount.amountFloat = parseFloat(values.amount || '0');

        url += '?';
        url += 'to=' + (to || '');
        url += '&amount=' + amount.toString();
        url += '&memo=' + (memo || '');

        return (<span>
                {tt('oauth_main_jsx.link')}
                <a href={url}>{url}</a>
            </span>);
    };

    render() {
        const { state, } = this;
        const { done, account, balances, initial, } = state;

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

        const getBalance = (sym) => {
            let balance = balances && sym && balances[sym];
            if (!balance) balance = Asset(0, 3, 'GOLOS');
            return balance;
        };

        let balanceOptions = [];
        if (balances)
            for (let bal of Object.keys(balances)) {
                balanceOptions.push(<option key={bal} value={bal}>{bal}</option>);
            }

        let form = null;
        if (initial) form = (<Formik
                initialValues={initial}
                validate={this.validate}
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
                            name='from'
                            className='input-group-field'
                            placeholder={tt('oauth_transfer.from')}
                            autoComplete='off'
                            disabled={true}
                        />
                    </div>

                    <div className='input-group'>
                        <span className='input-group-label'>@</span>
                        <Field
                            type='text'
                            name='to'
                            className='input-group-field'
                            placeholder={tt('oauth_transfer.to')}
                            autoComplete='off'
                            disabled={isSubmitting}
                            onChange={e => this.onToChange(e, handleChange)}
                        />
                    </div>
                    <ErrorMessage name='to' component='div' className='error' />

                    <div className='input-group'>
                        <Field
                            type='text'
                            className='input-group-field'
                            name='amount'
                            placeholder={tt('oauth_transfer.amount')}
                            autoComplete='off'
                            disabled={isSubmitting}
                            onChange={e => this.onAmountChange(e, values, handleChange)}
                        />
                        <span className='input-group-label AssetSelect'>
                            <Field as='select' name='sym'>
                                {balanceOptions}
                            </Field>
                        </span>
                    </div>
                    <a className='Balance' onClick={e => this.useAllBalance(e, values.sym, setFieldValue)}>{tt((donate ? 'oauth_donate' : 'oauth_transfer') + '.balance') + getBalance(values.sym)}</a>
                    <ErrorMessage name='amount' component='div' className='error' />

                    <Field
                        style={{ marginTop: '1rem', }}
                        type='text'
                        name='memo'
                        placeholder={tt('oauth_transfer.memo')}
                        autoComplete='off'
                        disabled={isSubmitting}
                    />

                    {isSubmitting && <LoadingIndicator type='circle' />}
                    <button className={'button ' + ((isSubmitting || errors.amount || !values.amount) ? ' disabled' : '')}
                        type='submit' disabled={isSubmitting || errors.amount || !values.amount}>
                        {tt((donate ? 'oauth_donate' : 'oauth_transfer') + '.submit')}
                    </button>
                    {done ? <span className='success done'>
                        {tt('g.done')}
                    </span> : null}
                    <div className='callout secondary page-link'>
                        {this.compose(values)}
                    </div>
                </form>
            )}
            </Formik>);

        return (<div className='Signer_page'>
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
                    {form}
                </div>
            </div>
        </div>);
    }
};

export default withRouter(TransferDonate);
