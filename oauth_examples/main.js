const { api, } = golos;
const { broadcast, } = golos;
const { oauth, } = golos;

const API_HOST = 'http://37.18.27.45:8080';

golos.config.set('oauth.client', 'localfile');
golos.config.set('oauth.host', API_HOST);
golos.config.set('oauth.ui_host', 'http://37.18.27.45:3000');
golos.config.set('websocket', API_HOST + '/api/oauth/sign');
golos.config.set('credentials', 'include');

let account = '';

$('.login').click(e => {
    oauth.login();
    oauth.waitForLogin(() => {
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

async function init() {
    const res = await oauth.checkReliable();
    if (res.authorized) {
        $('.login-form').hide();
        $('.actions').show();
        $('.username').text(res.account);
        account = res.account;
    } else {
        $('.login-form').show();
        $('.actions').hide();
    }
    $('.loading').hide();
}
init();
