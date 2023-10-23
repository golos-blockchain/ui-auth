import nextConnect from '@/server/nextConnect'

import getUIAAddress from '@/server/getUIAAddress'

let handler = nextConnect({ attachParams: true, })
    .get('/api/reg/uia_address/:symbol/:account', async (req, res) => {
        const { symbol, account, } = req.params;

        const errResp = (errorName, logData, errorData) => {
            let logErr = logData
            if (!Array.isArray(logErr)) {
                logErr = [logErr]
            }
            console.error('/uia_address', errorName, symbol, ...logErr)
            res.json({
                status: 'err',
                error: errorName,
                symbol,
                error_data: errorData,
            })
        }

        await getUIAAddress(account, symbol, (address) => {
            res.json({
                status: 'ok',
                address,
            })
        }, errResp)
    })

export default handler
