import React from 'react';
import tt from 'counterpart';
import golos from 'golos-lib-js';
import { Asset, } from 'golos-lib-js/lib/utils';
import { Formik, Field, ErrorMessage, } from 'formik';
import Head from 'next/head';

import LoadingIndicator from '@/elements/LoadingIndicator'
import LoginForm from '@/modules/LoginForm';
import NFTTokens from '@/elements/nft/NFTTokens'
import Header from '@/modules/Header'
import { getOAuthCfg, getChainData, } from '@/server/oauth';
import { getOAuthSession, } from '@/server/oauthSession';
import { withSecureHeadersSSR, } from '@/server/security';
import { callApi, } from '@/utils/OAuthClient';
import validate_account_name from '@/utils/validate_account_name';

const uncompose = (query, initial) => {
    initial.to = query.to || initial.to
    if (query.token_id) initial.token_id = query.token_id
    initial.memo = query.memo || initial.memo
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
        if (chainData.frozen) {
            return await holder.freeze(session.account)
        }
        initial = {
            from: session.account,
            to: '',
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

class TransferNFT extends React.Component {
    static propTypes = {
    };

    state = {
    };

    componentDidMount() {
        const { initial, chainData } = this.props
        if (initial) {
            if (initial.token_id) {
                const { nft_tokens } = chainData
                let exists = false
                let not_your = false
                let first
                for (const token of nft_tokens) {
                    first = first || token.token_id
                    if (token.token_id.toString() === initial.token_id.toString()) {
                        exists = true
                        if (token.owner !== initial.from) {
                            not_your = true
                        }
                        break
                    }
                }
                this.setState({ 
                    selected: exists ? initial.token_id : first,
                    query_token_error: !exists ? tt('oauth_transfer_nft.token_not_exist') : not_your ? tt('oauth_transfer_nft.token_is_not_your') : null
                })
            } else {
                const { nft_tokens } = chainData
                if (nft_tokens.length) {
                    this.setState({ 
                        selected: nft_tokens[0].token_id
                    })
                }
            }
        }
    }

    normalizeChainData = () => {
        const { chainData, } = this.props;
        if (!chainData || !golos.isNativeLibLoaded()) {
            return;
        }
        return chainData
    }

    onToChange = (e, handle) => {
        let value = e.target.value.trim().toLowerCase();
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

        return errors;
    };

    _onSubmit = (values, { setSubmitting, }) => {
        this.setState({
            done: false,
        })

        const { action, session, oauthCfg, } = this.props;
        const { sign_endpoint, } = oauthCfg;
        const { from, to, } = values;
        const { selected } = this.state

        let memo = values.memo || '';

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
        golos.broadcast.nftTransfer('', parseInt(selected), from, to, memo, callback);
    };

    compose = (values) => {
        if (!$GLS_IsBrowser) {
            return;
        }

        let url = window.location.href.split('?')[0];

        const chainData = this.normalizeChainData()
        const { to, memo, } = values;

        if (!golos.isNativeLibLoaded() || !chainData)
            return '...';

        url += '?';
        url += 'to=' + (to || '');
        if (this.state.selected) {
            url += '&token_id=' + this.state.selected
        }
        url += '&memo=' + (memo || '');

        return (<span>
                {tt('oauth_main_jsx.link')}
                <a href={url}>{url}</a>
            </span>);
    };

    render() {
        const { state, } = this;
        const { done, selected, query_token_error } = state;
        const chainData = this.normalizeChainData()

        const { action, oauthCfg, session, initial, } = this.props;
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

        if (!chainData)
            return null

        const { nft_tokens } = chainData

        let form = null;
        if (initial && chainData) form = (<Formik
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

                    {query_token_error && <div className='error'>{query_token_error}</div>}

                    {nft_tokens.length ?
                        <NFTTokens tokens={nft_tokens} selected={selected || nft_tokens[0].token_id}
                            onItemClick={(e, token) => {
                                e.preventDefault()
                                this.setState({
                                    selected: token.token_id,
                                    query_token_error: null
                                })
                            }}
                        /> :
                    <div>{tt('oauth_transfer_nft.no_tokens')}</div>}

                    <Field
                        style={{ marginTop: '1rem', }}
                        type='text'
                        name='memo'
                        placeholder={tt('oauth_transfer.memo')}
                        autoComplete='off'
                        disabled={isSubmitting}
                    />

                    {isSubmitting && <LoadingIndicator type='circle' />}
                    <button className={'button ' + ((isSubmitting) ? ' disabled' : '')}
                        type='submit' disabled={isSubmitting}>
                        {tt('oauth_transfer.submit')}
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
            <div className='Signer_content TransferNFT row'>
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

export default TransferNFT
