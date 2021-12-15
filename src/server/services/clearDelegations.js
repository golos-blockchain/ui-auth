const config = require('config');
const golos = require('golos-lib-js');
const { initGolos, } = require('../initGolos');

const isProd = (process.env.NODE_ENV === 'production');
const CHECK_INTERVAL = isProd ? 43200 : 15;

const acc = config.get('registrar.account');
const acc_active = config.get('registrar.signing_key');

function retryFromStart(err, text) {
    console.error(text, err.message,
        'will retry all after 10 sec');
    setTimeout(clearDelegations, 10000);
};

async function fetchDeleg(from = '') {
    try {
        initGolos();
        return await golos.api.getVestingDelegationsAsync(acc, from, 1000, 'delegated');
    } catch (err) {
        retryFromStart(err, 'Cannot get delegations to clear');
        throw err;
    }
};

function isExpired(obj) {
    const expired = new Date(obj.min_delegation_time);
    if (isProd) return expired < new Date();
    return true;
}

async function tryUndelegate(obj) {
    initGolos();
    await golos.broadcast.delegateVestingSharesWithInterestAsync(
        acc_active, acc, obj.delegatee, '0.000000 GESTS', obj.interest_rate, [])
};

async function clearDelegations() {
    console.log('clearDelegations - starting loop');
    let res = [];
    let from = '';
    let recalled = 0;
    while (recalled < 100) {
        try {
            res = await fetchDeleg(from);
        } catch (err) {
            return;
        }
        if (!res.length || (res.length === 1 && res[0].delegatee === from))
            break;
        const last = res.length - 1;
        from = res[last].delegatee;
        for (let i = last; i >= 0 && recalled < 100; --i) {
            if (isExpired(res[i])) {
                try {
                    await tryUndelegate(res[i]);
                    ++recalled;
                } catch (err) {
                    console.error('Cannot undelegate, skipping:', res[i].delegatee, err.message);
                }
            }
        }
        if (recalled)
            console.log('clearDelegations:', recalled);
    }
    setTimeout(clearDelegations, CHECK_INTERVAL * 1000);
};

module.exports = clearDelegations;
