import config from 'config';
import gmailSend from 'gmail-send';
import golos, { api, broadcast } from 'golos-lib-js'
import { hash, } from 'golos-lib-js/lib/auth/ecc';
import { Asset } from 'golos-lib-js/lib/utils'
import secureRandom from 'secure-random';
import tt from 'counterpart'

import nextConnect from '@/server/nextConnect';
import { throwErr, } from '@/server/error';
import { initGolos, } from '@/server/initGolos';
import { getVersion, rateLimitReq, slowDownLimitReq, getRemoteIp,
        noBodyParser, bodyParams, } from '@/server/misc';
import passport, { addModalRoutes, checkAlreadyUsed } from '@/server/passport';
import { getDailyLimit, obtainUid, getClientCfg, } from '@/server/reg';
import { regSessionMiddleware, } from '@/server/regSession';
import Tarantool from '@/server/tarantool';
import { delay, } from '@/utils/misc'

initGolos();

let handler = nextConnect({ attachParams: true, })
    .use(regSessionMiddleware)
    .use(passport.initialize())
    .use(passport.session())

    .get('/api/reg/get_uid', async (req, res) => {
        obtainUid(req);
        await req.session.save();
        res.json({
            status: 'ok',
            version: getVersion(),
            free_limit: getDailyLimit().limit
        })
    })

    .get('/api/reg/set_locale/:locale', async (req, res) => {
        const { locale, } = req.params;
        if (locale !== 'ru' && locale !== 'en') {
            throwErr(req, 400, ['Locale must be ru or en']);
        }
        let localeWasAlreadySet = false;
        if (req.session.locale === locale)
            localeWasAlreadySet = true;
        req.session.locale = locale;
        await req.session.save();
        res.json({
            status: 'ok',
            locale_was_already_set: localeWasAlreadySet,
        });
    })

    .get('/api/reg/get_client/:client?', async (req, res) => {
        const { locale, } = req.query;
        if (locale && locale !== 'ru' && locale !== 'en') {
            throwErr(req, 400, ['Locale must be ru or en']);
        }
        let cfg = getClientCfg(req, req.params, locale);
        res.json({
            status: 'ok',
            version: cfg.version,
            ...cfg,
        });
    })

    .post('/api/reg/send_code', async (req, res) => {
        let state = {
            verification_way: 'email',
            step: 'sending',
        };

        rateLimitReq(req, state);

        if (!config.gmail_send.user || !config.gmail_send.pass) {
            throwErr(req, 503, ['registration_with_email_disabled'], null, state);
        }

        let params = await bodyParams(req, false);

        const { email } = params;

        //const retry = params.retry ? params.retry : null;

        if (!email) {
            throwErr(req, 400, ['no_email_parameter'], null, state);
        }
        const fakeEmailsAllowed = config.has('fake_emails_allowed')
            && config.get('fake_emails_allowed');
        if (fakeEmailsAllowed && !/^[a-z0-9](\.?[a-z0-9]){5,}@g(oogle)?mail\.com$/.test(email)) {
            throwErr(req, 400, ['wrong_mail_service'], null, state)
        }

        if (email.split('@')[0].includes('.')) {
            throwErr(req, 400, ['google_aliases_not_supported'], null, state)
        }

        const emailHash = hash.sha256(email, 'hex');

        console.log('/send_code existing_email');

        await checkAlreadyUsed(req, 'email', emailHash, state)

        let confirmation_code = parseInt(
            secureRandom.randomBuffer(8).toString('hex'),
            16
        ).toString(10).substring(0, 4); // 4 digit code

        console.log('-- /send_code select user');

        let user = await Tarantool.instance('tarantool').select('users', 'by_verify_uid',
            1, 0, 'le', ['email', emailHash, req.session.uid, true]);

        // TODO возможно сделать срок активности для кодов
        //const seconds_ago = (Date.now() - mid.updated_at) / 1000.0;
        //const timeAgo = process.env.NODE_ENV === 'production' ? 300 : 10;

        //if (retry) {
        //    confirmation_code = mid.confirmation_code;
        //} else {
        //    if (seconds_ago < timeAgo) {
        //        res.json({ status: 'attempts_300' });
        //        return;
        //    }
        //    await mid.update({ confirmation_code, email: emailHash });
        //}

        if (user[0] && user[0][2] === 'email' && user[0][3] === emailHash && user[0][1] === req.session.uid) {
            if (user[0][4]) {
                req.session.user = user[0][0];
                await req.session.save();

                state.step = 'verified';
                res.json({
                    status: 'ok',
                    already_verified: true,
                    ...state,
                });
                return;
            }
        } else {
            user[0] = null;
        }

        // Send mail
        const send = gmailSend({
            user: config.gmail_send.user,
            pass: config.gmail_send.pass,
            from: 'registrator@golos.id',
            to: email,
            subject: 'Golos verification code',
        });

        try {
            await send({
                html: `Registration code: <h4>${confirmation_code}</h4>`,
            });
        } catch (e) {
            console.log('Send code to e-mail error', e);
            throwErr(req, 500, ['cannot_send_email'], null, state);
        }

        const ip = getRemoteIp(req);

        if (!user[0]) {
            console.log('-- /send_code insert user');
            user = await Tarantool.instance('tarantool').insert('users',
                [null, req.session.uid, 'email', emailHash, false,
                confirmation_code, ip, false]);
        } else {
            console.log('-- /send_code update user');
            user = await Tarantool.instance('tarantool').update('users',
                'primary', [user[0][0]],
                [['=', 5, confirmation_code], ['=', 6, ip]])
        }

        state.step = 'sent';
        state.status = 'ok';
        res.json({
            status: 'ok',
            already_verified: false,
            ...state,
        });
    })

    .post('/api/reg/verify_code', async (req, res) => {
        let state = {
            verification_way: 'email',
            step: 'sent',
        };

        rateLimitReq(req, state, 10);

        let params = {};

        let error = false

        params = await bodyParams(req, false);

        const { confirmation_code, email, } = params;

        console.log(
            '-- /api/verify_code -->',
            email,
            confirmation_code
        );

        const emailHash = hash.sha256(email, 'hex');

        const user = await Tarantool.instance('tarantool').select('users', 'by_verify_uid',
            1, 0, 'eq', ['email', emailHash, req.session.uid, false]);

        if (!user[0]) {
            throwErr(req, 400, ['no_confirmation_for_this_email'], null, state);
        }

        if (user[0][5] != confirmation_code) {
            throwErr(req, 400, ['wrong_confirmation'], null, state);
        }

        await Tarantool.instance('tarantool').update('users', 'primary', [user[0][0]], [['=', 4, true]])

        req.session.user = user[0][0];
        await req.session.save();

        state.step = 'verified';
        state.status = 'ok';
        res.json({
            ...state,
        });
    })

    .get('/api/reg/check_soc_auth', async (req, res) => {
        const { soc_id, soc_id_type, soc_error, } = req.session
        let state = {
            verification_way: 'social-undefined',
            step: (soc_id_type && !soc_error) ? 'verified' : 'sending',
        }
        if (!soc_id && soc_error) {
            const se = soc_error
            delete req.session.soc_error // To do not prevent another tries
            await req.session.save()
            throwErr(req, se.status, [se.message], se.exception, state)
        }
        state.status = 'ok'
        res.json({
            soc_id_type: soc_id_type || null,
            ...state,
        })
    })

    .post('/api/reg/use_invite', async (req, res) => {
        let state = {
            verification_way: 'invite_code',
            step: 'sending',
        };

        rateLimitReq(req, state);

        let params = {};
        let error = false

        params = await bodyParams(req, false);

        const { invite_key } = params

        //const retry = params.retry ? params.retry : null;

        if (!invite_key) {
            throwErr(req, 400, ['no_invite_key_parameter'], null, state);
        }

        let invite = null;
        try {
            invite = await golos.api.getInviteAsync(invite_key);
        } catch (err) {
            if (err.message.includes('Invalid value')) {
                throwErr(req, 400, ['no_such_invite'], null, state);
            } else {
                console.error(`/use_invite ${invite_key}`, err);
                throwErr(req, 503, ['blockchain_not_available_for_invite'], null, state);
            }
            return;
        }
        if (!invite) {
            throwErr(req, 400, ['no_such_invite'], null, state);
        }

        console.log('-- /use_invite select user');

        const inviteHash = hash.sha256(invite_key, 'hex');

        let user = await Tarantool.instance('tarantool').select('users', 'by_verify_uid',
            1, 0, 'eq', ['invite_code', inviteHash, req.session.uid]);

        if (!user[0]) {
            console.log('-- /use_invite insert user');
            user = await Tarantool.instance('tarantool').insert('users',
                [null, req.session.uid, 'invite_code', inviteHash, true, '1234', getRemoteIp(req), false]);
        }

        req.session.user = user[0][0];
        await req.session.save();

        state.step = 'verified';
        state.status = 'ok';
        res.json({
            ...state,
        });
    })

    .get('/api/reg/get_free_poller/:amount', async (req, res) => {
        await slowDownLimitReq(req)

        const amountStr = req.params.amount.split('%20').join(' ')
        let amount
        try {
            amount = await Asset(amountStr)
        } catch (err) {
            res.json({
                status: 'err',
                error: 'Asset parse error'
            })
            return
        }

        let freeAmount
        try {
            const amountStep = 1 / Math.pow(10, amount.precision || 1)
            freeAmount = await Tarantool.instance('tarantool')
            .call('get_free_reg_poller',
                parseFloat(amount.amountFloat),
                amount.symbol,
                amountStep,
                Date.now()
            )
            freeAmount = freeAmount[0][0]
        } catch (err) {
            console.error('ERROR: cannot get_free_reg_poller', err);
        }

        if (freeAmount) {
            const ret = await Asset(0, amount.precision, amount.symbol)
            ret.amountFloat = freeAmount.toString()
            res.json({
                status: 'ok',
                amount: ret.toString()
            })
            return
        }

        res.json({
            status: 'err',
            error: 'Tarantool error'
        })
    })

    .get('/api/reg/wait_for_transfer/:amount', async (req, res) => {
        await slowDownLimitReq(req)

        const amountStr = req.params.amount.split('%20').join(' ')
        let amount
        try {
            amount = await Asset(amountStr)
        } catch (err) {
            res.json({
                status: 'err',
                error: 'Asset parse error'
            })
            return
        }

        const uid = req.session.uid

        if (!uid) throwErr(rew, 400, ['Not authorized - no uid in session'])

        const username = config.get('registrar.account')
        if (!username) throwErr(req, 400, ['No registrar.account in config'])

        const getBalance = async () => {
            const balances = await api.getAccountsBalancesAsync([username], {
                symbols: [amount.symbol]
            })
            let bal = balances[0][amount.symbol]
            if (bal) {
                bal = bal.balance
                return await Asset(bal)
            } else {
                const assets = await api.getAssetsAsync('', [amount.symbol])
                if (!assets[0]) throwErr(req, 400, ['No such asset'])
                bal = await Asset(assets[0].supply)
                bal.amount = 0
                return bal
            }
        }

        const stop = async () => {
            let delRes
            try {
                delRes = await Tarantool.instance('tarantool')
                .call('delete_reg_poller',
                    parseFloat(amount.amountFloat), amount.symbol
                )
                delRes = delRes[0][0]
            } catch (err) {
                console.error('ERROR: cannot delete reg poller', err);
            }
        }

        let initBal
        try {
            initBal = await getBalance()
        } catch (err) {
            console.error('wait_for_transfer getBalance', err)
            throwErr(req, 400, ['Blockchain unavailable'])
        }

        let pollerRes
        try {
            pollerRes = await Tarantool.instance('tarantool')
            .call('upsert_reg_poller',
                parseFloat(amount.amountFloat), amount.symbol, uid, parseFloat(initBal.amountFloat), Date.now()
            )
            pollerRes = pollerRes[0][0]
        } catch (err) {
            console.error('ERROR: cannot upsert_reg_poller', err);
            throwErr(req, 400, ['Cannot upsert reg_poller: ' + err.toString()])
        }

        if (pollerRes.err) {
            throwErr(req, 400, [pollerRes.err])
        }

        const pollMsec = process.env.NODE_ENV === 'development' ? 1000 : 5000
        let tries = 0
        for ( ;; ) {
            let bal
            try {
                bal = await getBalance()
            } catch (err) {
                throwErr(req, 400, ['Blockchain unavailable'])
            }

            initBal.amountFloat = pollerRes.res.init_bal.toString()

            if (tries > 3) {
                console.log('wait_for_transfer timeouted', uid)
                res.json({
                    status: 'err',
                    error: 'Timeouted',
                    username,
                    init_bal: initBal.toString(),
                    bal: bal.toString()
                })
                return
            }
            ++tries

            console.log('wait_for_transfer', username, initBal.toString(), bal.toString(), amount.toString())
            const delta = bal.minus(initBal)
            if (delta.gte(amount)) {
                let stopMe = false

                let hist
                try {
                    hist = await api.getAccountHistoryAsync(username, -1, 1000, {select_ops: ['transfer', 'asset_issue']})
                } catch (err) {
                    console.error('/api/reg/wait_for_transfer - getAccountHistoryAsync', err)
                    throwErr(req, 400, ['Blockchain unavailable'])
                }

                const created = pollerRes.res.created
                for (let i = hist.length - 1; i >= 0; --i) {
                    const timestamp = +new Date(hist[i][1].timestamp + 'Z')
                    if (timestamp < created) {
                        break
                    }

                    const [ opType, opData ] = hist[i][1].op
                    if (opType === 'transfer' || opType === 'asset_issue') {
                        if ((opData.to === username || (opData.to === '' && opData.from === username))
                            && opData.amount === amountStr) {
                            stopMe = true
                            break
                        }
                    }
                }

                if (stopMe) {
                    if (!req.session.deposited) {
                        req.session.deposited = {}
                    }
                    req.session.deposited[amount.symbol] = delta.toString()
                    await req.session.save()

                    await stop()

                    res.json({
                        status: 'ok',
                        deposited: delta.toString()
                    })
                    return
                } else {
                    console.warn('wait_for_transfer - amount increased but no op in history', JSON.stringify(hist))
                }
            }

            await delay(pollMsec)
        }
    })

    .get('/api/reg/make_order_receipt/:amount/:submitting', async (req, res) => {
        await slowDownLimitReq(req)

        const clientCfg = getClientCfg(req, req.params)
        const { apidex_service } = clientCfg.config
        const { uias } = clientCfg.config.registrar

        const amount = await Asset(req.params.amount.split('%20').join(' '))
        let exAmount = amount.clone()
        const exchanges = uias[exAmount.symbol]
        let error = null
        let result = null
        let order_receipts = []
        for (const ex of exchanges) {
            const [ sym1, sym2 ] = ex.split('/')
            let resEx
            try {
                const { dex } = golos.libs
                resEx = await dex.apidexExchange({sell: exAmount, buySym: sym2})
            } catch (err) {
                console.error(err)
            }
            if (!resEx) {
                error = tt('uia_register_jsx.cannot_check_orders') + exAmount.symbol + '/' + sym2
            }
            if (error) break
            if (resEx.remain) {
                error = tt('uia_register_jsx.too_low_orders') + exAmount.symbol + '/' + sym2 + tt('uia_register_jsx.cannot_register_with_it')
                break
            }
            if (resEx.error === 'no_orders') {
                error = tt('uia_register_jsx.no_orders') + exAmount.symbol + '/' + sym2 + tt('uia_register_jsx.cannot_register_with_it')
                break
            } else if (resEx.error) {
                error = resEx.error + tt('uia_register_jsx.unknown_error') + exAmount.symbol + '/' + sym2 + tt('uia_register_jsx.cannot_register_with_it')
                break
            }
            const pair = [exAmount.toString(), resEx.result.toString()]
            order_receipts.push(pair)
            exAmount = resEx.result.clone()
            result = exAmount.clone()
        }

        const deposited = req.session.deposited && req.session.deposited[amount.symbol]
        if (deposited && deposited === amount.toString()) {
            req.session.order_receipts = order_receipts
            req.session.order_receipt_time = Date.now()

            delete req.session.deposited[amount.symbol]

            await req.session.save()
        } else {
            order_receipts = []
        }

        if (req.params.submitting === 'true' && !order_receipts.length) {
            console.error('make_order_receipt error:', req.session.deposited, amount.symbol)
            error = 'wrong deposited'
            result = null
        }

        res.json({
            status: 'ok',
            result: result && result.toString(),
            error,
            order_receipts
        })
    })

    .post('/api/reg/place_order', async (req, res) => {
        await slowDownLimitReq(req)

        const { order_receipts, order_receipt_time } = req.session
        if (!order_receipts || !order_receipts.length || !order_receipt_time) {
            throwErr(req, 400, ['You have no deposited'])
        }
        if (Date.now() - order_receipt_time > 60*60*1000) {
            throwErr(req, 400, ['You timeouted order receipt'])
        }

        const amountStr = order_receipts[0][0]
        let amount
        try {
            amount = await Asset(amountStr)
        } catch (err) {
            res.json({
                status: 'err',
                error: 'Asset parse error'
            })
            return
        }

        let chainProps
        for (let i = 0; i < 3; ++i) {
            try {
                chainProps = await api.getChainPropertiesAsync()
                break
            } catch (err) {
                console.error('/api/reg/place_order - getChainPropertiesAsync', err)
                await delay(3000)
            }
        }
        if (!chainProps) {
            throwErr(req, 503, ['/api/reg/place_order - Blockchain node unavailable - cannot getChainPropertiesAsync'])
        }
        if (!chainProps.chain_status) {
            throwErr(req, 503, ['/api/reg/place_order - Blockchain node is stopped - chain_status is false'])
        }

        const username = config.get('registrar.account')

        const signingKey = config.get('registrar.signing_key')
        const orderid = Math.floor(Date.now() / 1000)
        let operations = [['limit_order_create', {
            owner: username,
            orderid,
            amount_to_sell: amountStr,
            min_to_receive: order_receipts[0][1],
            fill_or_kill: true,
            expiration: 0xffffffff
        }]]
        try {
            await broadcast.sendAsync({
                extensions: [],
                operations
            }, [signingKey])
        } catch (err) {
            console.error('/api/reg/place_order - Cannot sell tokens', err, amountStr, order_receipts[0][1])
            throwErr(req, 400, ['Cannot sell tokens'])
        }

        await delay(1500)

        let hist
        try {
            hist = await api.getAccountHistoryAsync(username, -1, 1000, {select_ops: ['fill_order']})
        } catch (err) {
            console.error('/api/reg/place_order - getAccountHistoryAsync', err)
            throwErr(req, 400, ['Blockchain unavailable'])
        }

        const toReceive = await Asset(order_receipts[0][1])

        let received, new_receipts
        for (let i = hist.length - 1; i >= 0; --i) {
            const timestamp = +new Date(hist[i][1].timestamp + 'Z') / 1000
            if (orderid - timestamp > 10) {
                break
            }

            const [ opType, opData ] = hist[i][1].op
            if (opType === 'fill_order') {
                if (opData.current_orderid == orderid || opData.open_orderid == orderid) {
                    if (order_receipts[0][1].split(' ')[1] === 'GOLOS') {
                        const golosAmount = await Asset(opData.current_orderid == orderid ?
                            opData.open_pays : opData.current_pays)

                        if (!received) {
                            received = await Asset(0, toReceive.precision, toReceive.symbol)
                        }
                        received = received.plus(golosAmount)
                        req.session.golos_received = received.toString()
                        delete req.session.order_receipts
                        await req.session.save()
                    } else {
                        req.session.order_receipts.shift()
                        await req.session.save()
                        new_receipts = req.session.order_receipts
                    }
                }
            }
        }

        if (received) {
            res.json({
                status: 'ok',
                received,
                step: 'verified',
                verification_way: 'uia'
            })
            return
        } else if (new_receipts) {
            res.json({
                status: 'ok',
                order_receipts: new_receipts
            })
            return
        }

        throwErr(req, 400, ['Cannot find fill_order operation'])
    })

handler = addModalRoutes(handler);

export default handler;

export {
    noBodyParser as config,
};
