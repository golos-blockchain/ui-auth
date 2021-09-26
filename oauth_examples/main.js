const { api, } = golos;
const { broadcast, } = golos;

const API_HOST = 'http://37.18.27.45:8080';
const UI_HOST = 'http://37.18.27.45:3000';
const CLIENT_ID = 'localfile';

golos.config.set('websocket', API_HOST + '/api/oauth/sign');
golos.config.set('credentials', 'include');

$('.login').click(e => {
    window.open(UI_HOST + '/oauth/' + CLIENT_ID);
    oauthWaitForLogin(() => {
        window.location.reload();
    }, () => {
        alert('Waiting for login is timeouted. Try again please.');
    });
});

$('.logout').click(async (e) => {
    await oauthLogout(API_HOST, CLIENT_ID);
    window.location.reload();
});

$('.transfer').click(async (e) => {
    console.log('--- Transfer... ---');
    const { from, to, amount } = document.forms[0];
    try {
        let res = await broadcast.transferAsync('', from.value, to.value,
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
    const { from, } = document.forms[0];
    let accs = null;
    try {
        accs = await api.getAccountsAsync([from.value]);
    } catch (err) {
        console.error('getAccounts error', err);
        return;
    }
    console.log('account is: ', accs);
    try {
        await broadcast.accountMetadataAsync('', from.value, accs[0].json_metadata || '{}');
    } catch (err) {
        console.error(err);
        alert(err);
        return;
    }
    alert('Success!');
});

async function init() {
    const res = await oauthCheckReliable();
    if (res.authorized) {
        $('.login-form').hide();
        $('.actions').show();
        $('.username').text(res.account);
    } else {
        $('.login-form').show();
        $('.actions').hide();
    }
    $('.loading').hide();
}
init();
