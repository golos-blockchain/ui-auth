import React from 'react'
import tt from 'counterpart'
import golos from 'golos-lib-js'

import TimeAgoWrapper from '@/elements/TimeAgoWrapper'
import { getHistoryAuthority, wifToPublic, parseKey, emptyAuthority, authorityToKey } from '@/utils/RecoveryUtils'

class OwnerReset extends React.Component {
    state = {
        oldOwner: '',
        oldOwnerError: '',
        tmpOwner: '',
        tmpOwnerError: '',
    }

    oldOwnerOnChange = (e) => {
        const { username } = this.props
        const oldOwner = e.target.value
        this.setState({ oldOwner })
        try {
            parseKey(username, oldOwner, 'owner')
            this.setState({ oldOwnerError: '' })
        } catch (error) {
            console.error(error)
            this.setState({
                oldOwnerError: tt('recovery_step2_jsx.old_password_error')
            })
        }
    }

    tmpOwnerOnChange = (e) => {
        const tmpOwner = e.target.value
        this.setState({ tmpOwner })
        try {
            const { new_owner_authority } = this.props
            const tmpPublic = authorityToKey(new_owner_authority)
            let pub = wifToPublic(tmpOwner)
            if (pub && pub === tmpPublic) {
                this.setState({
                    tmpOwnerError: '',
                })
            } else {
                throw new Error(pub + ' != ' + tmpPublic)
            }
        } catch (error) {
            console.error(error)
            this.setState({
                tmpOwnerError: tt('recovery_step3_jsx.wrong_tmp_owner') 
            })
        }
    }

    onFinish = async (e) => {
        e.preventDefault()
        const { username, } = this.props

        let oldOwner = parseKey(username, this.state.oldOwner, 'owner')
        let roa = emptyAuthority(oldOwner)
        const pubOld = roa.key_auths[0][0]
        try {
            roa = await getHistoryAuthority(username, pubOld)
            if (!roa) throw new Error('Not found authority in history')
        } catch (err) {
            console.error(err)
            this.setState({
                errorMessage: err.message || err
            })
            return
        }

        const new_owner_authority = emptyAuthority(this.state.tmpOwner)
        let operations = []
        operations.push(['recover_account', {
            account_to_recover: username,
            new_owner_authority,
            recent_owner_authority: roa,
            extensions: []
        }])

        const signKeys = [ this.state.tmpOwner, oldOwner.toString() ]

        try {
            await golos.broadcast.sendAsync({
                operations,
                extensions: []
            }, signKeys)
        } catch (err) {
            console.error(err, err.payload)
            this.setState({
                errorMessage: err.message || err
            })
            return
        }

        window.location.reload()
    }

    onCancelReset = e => {
        localStorage.removeItem('recovery.sent')
        window.location.reload()
    }

    render() {
        const { new_owner_authority } = this.props
        const { oldOwner, oldOwnerError, tmpOwner, tmpOwnerError,
             done, errorMessage } = this.state
        const cancelBtn = <button className={'button hollow float-right'} onClick={this.onCancelReset}>
                {tt('recovery_step3_jsx.cancel')}</button>
        try {
            authorityToKey(new_owner_authority)
        } catch (err) {
            return <form><div className='error'>
                {tt('recovery_step3_jsx.wrong_approve')}
                {err.message || err}
                {cancelBtn}
            </div></form>
        }
        return <form>
            {tt('recovery_step3_jsx.approved')}
            <input type='password' value={tmpOwner} onChange={this.tmpOwnerOnChange} />
            {tmpOwnerError ? <div className='error'>{tmpOwnerError}</div> : null}

            {tt('recovery_step3_jsx.approved2')}<br/>
            <input type='password' value={oldOwner} onChange={this.oldOwnerOnChange} />
            {oldOwnerError ? <div className='error'>{oldOwnerError}</div> : null}

            {tt('recovery_step3_jsx.approved3')}<br/><br/>
            {errorMessage ? <div className='error'>{errorMessage}</div> : null}
            <button className={'button'} onClick={this.onFinish}>
                {tt('recovery_step3_jsx.finish')}</button>&nbsp;
            {cancelBtn}
        </form>
    }
}

export default OwnerReset
