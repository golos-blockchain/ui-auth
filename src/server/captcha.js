import axios from 'axios'
import config from 'config'
import querystring from 'querystring'

export const checkCaptcha = async (response, cfgPath = 'captcha') => {
    let captcha = config.has(cfgPath) && config.get(cfgPath)
    if (captcha) {
        let recaptcha_v2 = captcha.get('recaptcha_v2')
        if (recaptcha_v2.get('enabled')) {
            const secret_key = recaptcha_v2.get('secret_key')

            const res = await axios.post('https://www.google.com/recaptcha/api/siteverify',
                querystring.stringify({
                    secret: secret_key,
                    response
                })
            )
            if (!res.data.success) {
                return false
            }
        }
    }
    return true
}
