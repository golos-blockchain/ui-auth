import React from 'react'
import golos, { api } from 'golos-lib-js'
import { Formik, Field, } from 'formik'
import tt from 'counterpart'

import LoadingIndicator from '@/elements/LoadingIndicator'
import { STEPS } from '@/utils/RecoveryUtils'

class EnterName extends React.Component {
	state = {
	}

    _onSubmit = async (values, { setSubmitting, }) => {
        let res
        try {
            res = await api.getAccountsAsync([values.username])
        } catch (err) {
            console.error(err)
            this.setState({
                errorMessage: err.message || err
            })
            setSubmitting(false)
            return
        }
        if (res && res[0]) {
            setSubmitting(false)
            const { recovery_account } = res[0]
            const { toStep } = this.props
            toStep(STEPS.NotifyingPartner, {
            	username: values.username,
            	recovery_account
            })
            return
        }
        this.setState({
            errorMessage: tt('g.account_not_found')
        })
        setSubmitting(false)
    }

    render = () => {
        return (<Formik
                initialValues={{
                    username: ''
                }}
                onSubmit={this._onSubmit}
            >
            {({
                handleSubmit, isSubmitting, isValid, dirty, errors, touched, values, handleChange, setFieldValue,
            }) => {
                const isDisabled = !values.username
                const { errorMessage } = this.state
                return (<form
                    onSubmit={handleSubmit}
                    autoComplete='off'
                >
                    {tt('recovery.recover_desc')}
                    <br />
                    <br />
                    <span>{tt('recovery.input_name')}:</span>
                    <div className='input-group'>
                        <Field
                            type='text'
                            name='username'
                            className='input-group-field'
                            autoComplete='off'
                        />
                    </div>

                    {errorMessage ? <div className='error'>{errorMessage}</div> : ''}

                    {isSubmitting ? <LoadingIndicator type='circle' /> : <button className={'button' + (isDisabled ? ' disabled' : '')}
                        type='submit' disabled={isDisabled}>
                        {tt('recovery.continue')}
                    </button>}
                </form>)
            }}
            </Formik>)
    }
}

export default EnterName
