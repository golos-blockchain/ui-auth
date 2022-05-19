import React from 'react'
import tt from 'counterpart'
import golos from 'golos-lib-js'

import GeneratedPasswordInput from '@/elements/GeneratedPasswordInput'
import KeyFile from '@/utils/KeyFile'
import { wifToPublic, authorityToKey, parseKey, emptyAuthority } from '@/utils/RecoveryUtils'

class FinalReset extends React.Component {
    state = {
        tmpOwner: '',
        tmpOwnerError: '',
    }

    onPasswordChange = (newPassword, passwordValid, allBoxChecked) => {
        this.setState({
            newPassword
        })
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

    onSubmit = async (e) => {
        e.preventDefault()
        const { username, json_metadata } =this.props
        const { tmpOwner, newPassword } = this.state

        let operations = []

        const op = {}
        const privKeys = {}
        for (let role of ['posting','active','owner']) {
            op[role] = parseKey(username, newPassword, role)
            privKeys[role] = op[role].toString()
            op[role] = emptyAuthority(op[role])
        }
        let memo_key = parseKey(username, newPassword, 'memo')
        privKeys['memo'] = memo_key.toString()
        memo_key = wifToPublic(memo_key)
        operations.push(['account_update', {
            account: username,
            ...op,
            memo_key,
            json_metadata
        }])

        try {
            const keyFile = new KeyFile(username, {password: newPassword, ...privKeys})

            await golos.broadcast.sendAsync({
                operations,
                extensions: []
            }, [tmpOwner])

            localStorage.removeItem('recovery.sent')

            keyFile.save()

            this.setState({
                done: true,
                errorMessage: ''
            })
        } catch (err) {
            console.error(err, err.payload)
            this.setState({
                errorMessage: (err.message || err)
            })
        }
    }

    render() {
        const { tmpOwner, tmpOwnerError, errorMessage, done } = this.state
        return <form>
            {tt('recovery_step3_jsx.reset')}<br/>
            <GeneratedPasswordInput
                onChange={this.onPasswordChange}
                showPasswordString={true}
            />

            {tt('recovery_step3_jsx.to_apply')}<br/>
            <input type='password' value={tmpOwner} onChange={this.tmpOwnerOnChange} />
            {tmpOwnerError ? <div className='error'>{tmpOwnerError}</div> : null}

            {errorMessage ? <div className='error'>{errorMessage}</div> : null}
            {done ? <div className='done'>{tt('recovery_step3_jsx.done')}</div> :
            <button className={'button'} onClick={this.onSubmit}>
                {tt('recovery_step3_jsx.finish2')}</button>}
            <br/><br/>
        </form>
    }
}

export default FinalReset
