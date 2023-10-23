import React from 'react'
import tt from 'counterpart'
import { Asset } from 'golos-lib-js/lib/utils';

import LoadingIndicator from '@/elements/LoadingIndicator'
import { callApi, } from '@/utils/RegApiClient'

class TransferWaiter extends React.Component {
    state = {
    }

    constructor(props) {
        super(props)
    }

    poll = async (sym) => {
        const retry = async () => {
            await new Promise(resolve => setTimeout(resolve, 1000))
            if (!this.state.stopped)
                this.poll(sym)
        }
        try {
            let res = await callApi('/api/reg/wait_for_transfer/' + sym)
            res = await res.json()
            if (res.status === 'ok') {
                const { onTransfer } = this.props
                onTransfer(Asset(res.delta))
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
        this.setState({
            seconds: 30*60,
            stopped: false
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

        const { sym, } = this.props

        this.poll(sym)
    }

    componentDidMount() {
        this.start()
    }

    stop = () => {
        if (this.countdown) clearInterval(this.countdown)
        this.setState({
            stopped: true
        })
    }

    componentWillUnmount() {
        this.stop()
    }

    componentDidUpdate(prevProps) {
        if (this.props.sym !== prevProps.sym) {
            this.stop()
            this.start()
        }
    }

    render() {
        const { seconds } = this.state
        if (!seconds) return null
        const min = Math.floor(seconds / 60)
        const sec = seconds % 60
        const remaining = min.toString().padStart(2, '0') + ':' + sec.toString().padStart(2, '0')
        const { sym, title } = this.props
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
