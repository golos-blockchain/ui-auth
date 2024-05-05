import React from 'react'
import tt from 'counterpart'
import Link from 'next/link'

import { withRouterHelpers, } from '@/utils/routing'

class VerifyWayTabs extends React.Component {
    onTabChange = (e) => {
        e.preventDefault()
    }

    getPath = () => {
        const { router } = this.props
        let path = (router.asPath.split('#')[0])
        path = path.split('?')[0]
        return path
    }

    render() {
        const { clientCfg, currentWay } = this.props

        const methods = clientCfg.config.registrar.methods

        const path = this.getPath()

        const methodObjs = []

        let k = 0
        const curKey = () => {
            return ++k
        }

        const separator = () => <React.Fragment key={curKey()}>&nbsp;|&nbsp;</React.Fragment>

        const addMethod = (method) => {
            if (methodObjs.length) {
                methodObjs.push(separator())
            }
            methodObjs.push(method)
        }

        let social
        if (!methods || methods.social) {
            social = tt('verify_way_tabs_jsx.social')
            if (currentWay === 'social') {
                social = <span key={curKey()}>{social}</span>
            } else {
                social = <Link key={curKey()} href={path}>{social}</Link>
            }
            addMethod(social)
        }

        let invite
        if (!methods || methods.invite_code) {
            invite = tt('verify_way_tabs_jsx.invite_code')
            if (currentWay === 'invite_code') {
                invite = <span key={curKey()}>{invite}</span>
            } else {
                invite = <Link key={curKey()} href={path + '?invite'}>{invite}</Link>
            }
            addMethod(invite)
        }

        let transfer
        if (!methods || methods.transfer) {
            transfer = tt('verify_way_tabs_jsx.transfer')
            if (currentWay === 'transfer') {
                transfer = <span key={curKey()}>{transfer}</span>
            } else {
                transfer = <Link key={curKey()} href={path + '?transfer'}>{transfer}</Link>
            }
            addMethod(transfer)
        }

        let uia
        if (!methods || methods.uia) {
            uia = tt('verify_way_tabs_jsx.with_uia')
            if (currentWay === 'uia') {
                uia = <span key={curKey()}>{uia}</span>
            } else {
                uia = <Link key={curKey()} href={path + '?uia'}>{uia}</Link>
            }
            addMethod(uia)
        }

        return <div style={{ marginBottom: '1.0rem' }}>
                {methodObjs}
            </div>
    }
}

export default withRouterHelpers(VerifyWayTabs)
