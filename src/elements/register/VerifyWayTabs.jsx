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
        const { currentWay } = this.props

        const path = this.getPath()

        let email = tt('verify_way_tabs_jsx.email')
        if (currentWay === 'email') {
            email = <span>{email}</span>
        } else {
            email = <Link href={path}>{email}</Link>
        }

        let invite = tt('verify_way_tabs_jsx.invite_code')
        if (currentWay === 'invite_code') {
            invite = <span>{invite}</span>
        } else {
            invite = <Link href={path + '?invite'}>{invite}</Link>
        }

        let transfer = tt('verify_way_tabs_jsx.transfer')
        if (currentWay === 'transfer') {
            transfer = <span>{transfer}</span>
        } else {
            transfer = <Link href={path + '?transfer'}>{transfer}</Link>
        }

        return <div style={{ marginBottom: '1.0rem' }}>
                {email}
                &nbsp;|&nbsp;
                {invite}
                &nbsp;|&nbsp;
                {transfer}
            </div>
    }
}

export default withRouterHelpers(VerifyWayTabs)