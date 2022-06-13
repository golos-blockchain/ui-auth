import React from 'react';
import tt from 'counterpart';
import golos from 'golos-lib-js';
import { Asset, } from 'golos-lib-js/lib/utils';
import { Formik, Field, ErrorMessage, } from 'formik';
import Head from 'next/head';
import LoadingIndicator from '@/elements/LoadingIndicator';
import Header from '@/modules/Header';
import LoginForm from '@/modules/LoginForm';
import { getOAuthCfg, getChainData, } from '@/server/oauth';
import { getOAuthSession, } from '@/server/oauthSession';
import { withSecureHeadersSSR, } from '@/server/security';
import { callApi, } from '@/utils/OAuthClient';
import validate_account_name from '@/utils/validate_account_name';

const uncompose = (query, initial) => {
    initial.to = query.to || initial.to;
    const amountSym = query.amount;
    if (amountSym) {
        const [ amount, sym, ] = amountSym.split(' ');
        initial.amount = amount;
        initial.sym = sym;
    }
    initial.memo = query.memo || initial.memo;
};

export const getServerSideProps = withSecureHeadersSSR(async ({ req, res, resolvedUrl, query, }) => {
    const action = resolvedUrl.split('?')[0].split('/')[2];
    let chainData = null;
    const holder = await getOAuthSession(req, res);
    if (!holder.oauthEnabled) {
        return await holder.clearAndRedirect();
    }
    const session = holder.session();
    let initial = null;
    if (session.account) {
        chainData = await getChainData(session.account, action);
        initial = {
            from: session.account,
            to: '',
            amount: '',
            sym: Object.keys(chainData.balances)[0],
            memo: '',
        };
        uncompose(query, initial);
    }
    return {
        props: {
            action,
            oauthCfg: getOAuthCfg(),
            session,
            chainData,
            initial,
        },
    };
})

class TransferDonate extends React.Component {
    static propTypes = {
    };

    state = {
    };

    normalizeBalances = () => {
        const { chainData, } = this.props;
        if (!chainData || !golos.isNativeLibLoaded()) {
            return;
        }
        let balances = { ...chainData.balances, };
        for (const sym in balances) {
            balances[sym] = Asset(balances[sym]);
        }
        return balances;
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
        const balances = this.normalizeBalances();
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
            const balances = this.normalizeBalances();
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

        const { action, session, oauthCfg, } = this.props;
        const { sign_endpoint, } = oauthCfg;
        const balances = this.normalizeBalances();
        const { from, to, sym, } = values;

        let amount = Asset(0, balances[sym].precision, sym);
        amount.amountFloat = values.amount
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

    compose = (values) => {
        if (!$GLS_IsBrowser) {
            return;
        }

        let url = window.location.href.split('?')[0];

        const balances = this.normalizeBalances();
        const { sym, to, memo, } = values;

        if (!golos.isNativeLibLoaded() || !balances || !balances[sym])
            return '...';

        let amount = Asset(0, balances[sym].precision, sym);
        amount.amountFloat = values.amount || '0'

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
        const { done, } = state;
        const balances = this.normalizeBalances();

        const { action, oauthCfg, session, initial, } = this.props;
        const { account, } = session;
        const donate = action === 'donate';

        if (account === null) {
            return (<div className='Signer_page'>
                <Head>
                    <meta charSet='utf-8' />
                    <title>{tt('oauth_main_jsx.' + action)} | {tt('oauth_main_jsx.title')}</title>
                </Head>
                <Header
                    logoUrl={'/'} />
                <LoginForm oauthCfg={oauthCfg} session={session} />
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
        if (initial && balances) form = (<Formik
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
                    <a className='Balance' onClick={e => this.useAllBalance(e, values.sym, setFieldValue)}>
                        {tt((donate ? 'oauth_donate' : 'oauth_transfer') + '.balance') + getBalance(values.sym)}
                    </a>
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
            <Head>
                <meta charSet='utf-8' />
                <title>{tt('oauth_main_jsx.' + action)} | {tt('oauth_main_jsx.title')}</title>
            </Head>
            <Header
                logoUrl={'/'}
                account={account} />
            <div className='Signer_content TransferDonate row'>
                <div
                    className='column'
                    style={{ maxWidth: '30rem', margin: '0 auto' }}
                >
                    <h3>{tt('oauth_main_jsx.' + action)}</h3>
                    {(!account || !form) && <LoadingIndicator type='circle' />}
                    {form}
                </div>
            </div>
        </div>);
    }
};

export default TransferDonate;
