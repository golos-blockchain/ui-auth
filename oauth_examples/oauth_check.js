async function oauthCheck(apiHost, clientId) {
    let url = new URL('/api/oauth/check/' + clientId, apiHost);
    const res = await fetch(url.toString(), {
        credentials: 'include',
    });
    return await res.json();
}

async function oauthCheckReliable() {
    let res = null;
    try {
        res = await oauthCheck(API_HOST, CLIENT_ID);
        return res;
    } catch (err) {
        console.error('oauthCheck error:', err, 'retrying...');
        setTimeout(oauthCheckReliable, 3000);
    }
}

async function oauthWaitForLogin(onFinish, onFail, retries = 180) {
    if (!retries) {
        console.error('waiting for login is timeouted');
        onFail();
        return;
    }
    const res = await oauthCheckReliable();
    if (res.authorized) {
        onFinish(res);
    } else {
        console.log('waiting for login...');
        setTimeout(() => {
            oauthWaitForLogin(onFinish, onFail, --retries);
        }, 1000);
    }
}
