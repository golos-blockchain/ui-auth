import React from 'react'
import tt from 'counterpart'

import BlogsAccountLink from '@/elements/BlogsAccountLink'
import TimeAgoWrapper from '@/elements/TimeAgoWrapper'

class WaitingOwnerReset extends React.Component {
    state = {
    }

    retry = (e) => {
        e.preventDefault()
        localStorage.removeItem('recovery.sent')
        window.location.reload()
    }

    render() {
        const { recovery_account, waitUntil, recoveryCfg, username } = this.props
        let form = <div>{tt('recovery_step3_jsx.sent_desc2')}<br/><br/>
            <b>{tt('recovery_step3_jsx.sent_desc3')}</b>
            {tt('recovery_step3_jsx.sent_desc4')}<br/><br/>
            {waitUntil ? <div>
                {tt('recovery_step3_jsx.retry_after')}<TimeAgoWrapper date={waitUntil} />
                .</div> : <div>
                    {tt('recovery_step3_jsx.can_retry')}&nbsp;
                    <a href='#' onClick={this.retry}>{tt('recovery_step3_jsx.cancel')}</a>
                </div>}
        </div>
        return <div>
            {tt('recovery_step2_jsx.your_account_is')}
            <BlogsAccountLink to={username} recoveryCfg={recoveryCfg} />.<br/><br/>
            <div>
                {tt('recovery_step3_jsx.sent_desc')}
                <BlogsAccountLink to={recovery_account} recoveryCfg={recoveryCfg} />.&nbsp;
                {form}
            </div>
        </div>
    }
}

export default WaitingOwnerReset
