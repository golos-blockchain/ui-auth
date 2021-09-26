async function oauthLogout(apiHost, clientId) {
    let url = new URL('/api/oauth/logout/' + clientId, apiHost);
    const res = await fetch(url.toString(), {
        credentials: 'include',
    });
}
