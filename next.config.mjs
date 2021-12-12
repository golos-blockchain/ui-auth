import config from 'config';
import { createSecureHeaders, } from 'next-secure-headers';

function convertEntriesToArrays(obj) {
    return Object.keys(obj).reduce((result, key) => {
        result[key] = obj[key].split(/\s+/); // split by space
        return result;
    }, {});
}

let cspDirectives = convertEntriesToArrays(config.get('helmet.directives'));
cspDirectives.reportURI = new URL('/api/csp_violation', config.get('rest_api'));
// TODO: it should be relative, instead of using config. But next-secure-headers do not supports it

export default {
    async headers() {
        return [
            {
                source: '/(.*)',
                headers: createSecureHeaders({
                    contentSecurityPolicy: {
                        directives: cspDirectives,
                    },
                    referrerPolicy: 'no-referrer',
                }),
            },
        ];
    },
}
