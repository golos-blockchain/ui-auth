import React from 'react'
import tt from 'counterpart'
import { Asset } from 'golos-lib-js/lib/utils';

import LoadingIndicator from '@/elements/LoadingIndicator'
import { delay, } from '@/utils/misc'
import { callApi, } from '@/utils/RegApiClient'

class TransferWaiter extends React.Component {
    state = {
    }

    constructor(props) {
        super(props)
    }

    poll = async (minAmount) => {
        const retry = async () => {
            await delay(1000)
            if (!this.stopped)
                this.poll(minAmount)
            else
                this.stoppedPolling = true
        }
        try {
            let res = await callApi('/api/reg/wait_for_transfer/' + minAmount.toString())
            res = await res.json()
            if (res.status === 'ok') {
                const { onTransfer } = this.props
                onTransfer(Asset(res.deposited))
            } else {
                console.error(res)
                await retry()
            }
        } catch (err) {
            console.error('TransferWaiter', err)
            await retry()
        }
    }

    start = async () => {
        this.stopped = false
        this.stoppedPolling = false
        this.setState({
            seconds: 15*60,
        })

        this.countdown = setInterval(() => {
            const { seconds } = this.state
            if (seconds === 0) {
                console.log('Countdown reached, stop.')
                this.stop()
                return
            }
            this.setState({
                seconds: seconds - 1
            })
        }, 1000)

        const { minAmount, } = this.props

        this.poll(minAmount)
    }

    componentDidMount() {
        this.start()
    }

    stop = async () => {
        if (this.countdown) clearInterval(this.countdown)
        this.stopped = true
        await delay(1000)
        if (!this.stoppedPolling) {
            await delay(3000)
        }
    }

    componentWillUnmount() {
        this.stop()
    }

    async componentDidUpdate(prevProps) {
        const { minAmount } = this.props
        if (minAmount && (!prevProps.minAmount ||
            minAmount.symbol !== prevProps.minAmount.symbol ||
            minAmount.amount !== prevProps.minAmount.amount)) {
            await this.stop()
            this.start()
        }
    }

    render() {
        const { seconds } = this.state
        if (!seconds) return null
        const min = Math.floor(seconds / 60)
        const sec = seconds % 60
        const remaining = min.toString().padStart(2, '0') + ':' + sec.toString().padStart(2, '0')
        const { title } = this.props
        return <div align="center" style={{ marginTop: '1rem', }}>
            {title}
            <div style={{ marginTop: '0.5rem', }}>
                <LoadingIndicator type='dots' />
                {remaining}
            </div>
        </div>
    }
}

export default TransferWaiter
