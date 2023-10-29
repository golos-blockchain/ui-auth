import React from 'react';
import tt from 'counterpart';
import golos from 'golos-lib-js';
import { Asset } from 'golos-lib-js/lib/utils';
import Head from 'next/head';
import { Formik, Field, ErrorMessage, } from 'formik';
import LoadingIndicator from '@/elements/LoadingIndicator';
import Header from '@/modules/Header';
import LoginForm from '@/modules/LoginForm';
import { getOAuthCfg, getChainData, } from '@/server/oauth';
import { getOAuthSession, } from '@/server/oauthSession';
import { withSecureHeadersSSR, } from '@/server/security';
import { steemToVests, } from '@/utils/misc'
import { callApi, } from '@/utils/OAuthClient';
import validate_account_name from '@/utils/validate_account_name';

function calcMaxInterest(cprops) {
    let maxInterestRate = 100;
    if (cprops) {
        maxInterestRate = Math.min(90, cprops.max_delegated_vesting_interest_rate / 100);
    }
    return maxInterestRate;
}

function calcDefaultInterest(cprops) {
    return Math.min(50, calcMaxInterest(cprops));
}

export const getServerSideProps = withSecureHeadersSSR(async ({ req, res, }) => {
    const action = 'delegate_vs';
    let chainData = null;
    const holder = await getOAuthSession(req, res);
    if (!holder.oauthEnabled) {
        return await holder.clearAndRedirect();
    }
    const session = holder.session();
    if (session.account) {
        chainData = await getChainData(session.account, action);
        if (chainData.frozen) {
            return await holder.freeze(session.account)
        }
    }
    return {
        props: {
            action,
            oauthCfg: getOAuthCfg(),
            session,
            chainData,
        },
    };
})

class Delegate extends React.Component {
    static propTypes = {
    };

    state = {
    };

    async componentDidMount() {
        await golos.importNativeLib()
        const { session, chainData, oauthCfg, } = this.props;
        if (!chainData) {
            return;
        }
        let balances = { ...chainData.balances, };
        for (const sym in balances) {
            balances[sym] = Asset(balances[sym]);
        }
        let initial = {
            from: session.account,
            to: '',
            amount: '',
            interest: calcDefaultInterest(chainData.cprops),
            sym: Object.keys(balances)[0],
        };
        this.uncompose(initial);
        this.setState({
            sign_endpoint: oauthCfg.sign_endpoint,
            balances,
            cprops: chainData.cprops,
            gprops: chainData.gprops,
            initial,
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

    onInterestChange = (e, values, handle) => {
        let value = e.target.value.trim().toLowerCase();
        if (!value) {
            e.target.value = '0';
            return handle(e);
        }
        if (isNaN(value) || parseFloat(value) < 0) {
            e.target.value = values.interest || '0';
            return;
        }
        e.target.value = value;
        return handle(e);
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
            const { amount, } = values;
            const sym = 'GOLOS';
            if (!isNaN(amount) && balances && balances[sym]) {
                let balance = parseFloat(balances[sym].amountFloat)
                if (!isNaN(balance) && balance < parseFloat(amount)) {
                    errors.amount = tt('oauth_transfer.insufficient');
                }
            }
        }

        if (values.interest) {
            const { cprops, } = this.state;
            if (cprops) {
                if (parseFloat(values.interest) > calcMaxInterest(cprops)) {
                    errors.interest = 'Too big percent';
                }
            }
        }

        return errors;
    };

    _onSubmit = (values, { setSubmitting, }) => {
        this.setState({
            done: false,
        })

        const { sign_endpoint, balances, } = this.state;
        const { from, to, } = values;

        let amount = Asset(0, balances['GOLOS'].precision, 'GOLOS');
        amount.amountFloat = values.amount
        amount = steemToVests(parseFloat(amount.amountFloat), this.state.gprops) + ' GESTS';

        let interest = parseFloat(values.interest);
        interest = Math.trunc(interest * 100);

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
        golos.broadcast.delegateVestingSharesWithInterest('', from, to,
            amount, interest, [], callback);
    };

    uncompose = (initial) => {
        const params = new URLSearchParams(window.location.search);
        initial.to = params.get('to') || initial.to;
        const amountSym = params.get('amount');
        if (amountSym) {
            const amount = amountSym.split(' ')[0];
            initial.amount = amount;
            initial.sym = 'GOLOS';
        }
    }

    compose = (values) => {
        let url = window.location.href.split('?')[0];

        const { balances, } = this.state;
        const { to, } = values;

        if (!golos.isNativeLibLoaded() || !balances || !balances['GOLOS'])
            return '...';

        let amount = Asset(0, balances['GOLOS'].precision, 'GOLOS');
        amount.amountFloat = values.amount || '0'

        url += '?';
        url += 'to=' + to;
        url += '&amount=' + amount.toString();

        return (<span>
                {tt('oauth_main_jsx.link')}
                <a href={url}>{url}</a>
            </span>);
    };

    render() {
        const { state, } = this;
        const { done, balances, initial, } = state;

        const { action, oauthCfg, session, } = this.props;
        const { account, } = session;

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

        let balance = balances && balances['GOLOS'];
        if (!balance) balance = Asset(0, 3, 'GOLOS');

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
                            <select>
                                {balanceOptions}
                            </select>
                        </span>
                    </div>
                    <a className='Balance' onClick={e => this.useAllBalance(e, 'GOLOS', setFieldValue)}>{tt('oauth_transfer.balance') + balance}</a>
                    <ErrorMessage name='amount' component='div' className='error' />

                    <div style={{ marginTop: '1rem', }}>{tt('oauth_delegate.interest')}</div>
                    <Field
                        type='text'
                        name='interest'
                        className='input-group-field'
                        autoComplete='off'
                        disabled={isSubmitting}
                            onChange={e => this.onInterestChange(e, values, handleChange)}
                    />
                    <ErrorMessage name='interest' component='div' className='error' />

                    {isSubmitting && <LoadingIndicator type='circle' />}
                    <button
                        style={{ marginTop: '1rem', }}
                        className={'button ' + ((isSubmitting || errors.amount || !values.amount) ? ' disabled' : '')}
                        disabled={isSubmitting || errors.amount || !values.amount}>
                        {tt('oauth_delegate.submit')}
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

        return (
            <div className='Signer_page'>
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
                        {!account && <LoadingIndicator type='circle' />}
                        {form}
                    </div>
                </div>
            </div>
        );
    }
};

export default Delegate;
