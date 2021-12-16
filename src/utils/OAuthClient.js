export async function callApi(apiName, data) {
    let request = {
        method: data ? 'post' : 'get',
        credentials: 'include',
        headers: {
            Accept: 'application/json',
            'Content-type': data ? 'application/json' : undefined,
        },
        body: data ? JSON.stringify(data) : undefined,
    };
    let res = await fetch(apiName, request);
    return res;
}
