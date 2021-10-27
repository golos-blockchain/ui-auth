const { api, } = golos;
const { broadcast, } = golos;
const { oauth, } = golos;

const API_HOST = 'https://dev.golos.app';

golos.config.set('oauth.client', 'localfile');
golos.config.set('oauth.host', API_HOST);
golos.config.set('websocket', API_HOST + '/api/oauth/sign');
golos.config.set('credentials', 'include');

let account = '';

$('.login').click(e => {
    oauth.login(['transfer', 'account_metadata', 'claim', 'donate']);
    oauth.waitForLogin(res => {
        window.location.reload();
    }, () => {
        alert('Waiting for login is timeouted. Try again please.');
    });
});

$('.logout').click(async (e) => {
    await oauth.logout();
    window.location.reload();
});

$('.transfer').click(async (e) => {
    console.log('--- Transfer... ---');
    const { to, amount } = document.forms[0];
    try {
        let res = await broadcast.transferAsync('', account, to.value,
            amount.value, 'Buy a coffee with caramel :)');
    } catch (err) {
        console.error(err);
        alert(err);
        return;
    }
    alert('Success!');
});

$('.meta').click(async (e) => {
    console.log('--- Update metadata... ---');
    const accountName = account || 'cyberfounder';
    let accs = null;
    try {
        accs = await api.getAccountsAsync([accountName]);
    } catch (err) {
        console.error('getAccounts error', err);
        return;
    }
    console.log('account is: ', accs);
    try {
        await broadcast.accountMetadataAsync('', accountName, accs[0].json_metadata || '{}');
    } catch (err) {
        console.error(err);
        alert(err);
        return;
    }
    alert('Success!');
});

async function claim(from, to) {
    console.log('--- Claiming from ' + from + ' to ' + to + ' TIP-balance... ---');
    try {
        await broadcast.claimAsync('', from, to, '0.001 GOLOS', false, []);
    } catch (err) {
        console.error(err);
        alert(err);
        return;
    }
    alert('Success!');
}

$('.claim-good').click(async (e) => {
    await claim(account, account);
})

$('.claim-bad').click(async (e) => {
    await claim(account, 'null');
})

async function init() {
    const res = await oauth.checkReliable();
    if (res.authorized) {
        $('.login-form').hide();
        $('.actions').show();
        $('.username').text(res.account);
        account = res.account;
        $('.allowed').text(JSON.stringify(res.allowed));
    } else {
        $('.login-form').show();
        $('.actions').hide();
    }
    $('.loading').hide();
}
init();
