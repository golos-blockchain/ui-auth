import React from 'react'
import tt from 'counterpart'

import TimeAgoWrapper from '@/elements/TimeAgoWrapper'

class WaitingFinalReset extends React.Component {
    render() {
        const { waitUntil } = this.props
        return <div>
                {tt('recovery_step3_jsx.last')}<br/><br/>

                {tt('recovery_step3_jsx.last2')}<TimeAgoWrapper date={waitUntil} />.
                <br/><br/>

                <b>{tt('recovery_step3_jsx.last3')}</b><br/><br/>
            </div>
    }
}

export default WaitingFinalReset
