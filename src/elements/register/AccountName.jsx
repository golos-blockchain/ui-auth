import React from 'react'
import tt from 'counterpart'

import { callApi, } from '@/utils/RegApiClient'
import validate_account_name from '@/utils/validate_account_name'

class AccountName extends React.Component {
    onChange = e => {
        const name = e.target.value.trim().toLowerCase(); // Add prefix here
        this.validateAccountName(name);
        const { onChange } = this.props
        if (onChange) {
            onChange(name)
        }
    }

    async validateAccountName(name) {
        let nameError = '';

        if (name.length > 0) {
            nameError = validate_account_name(name);

            if (!nameError) {
                try {
                    const res = await callApi(`/api/utils/account_exists/${name}`);

                    let data = await res.json();
                    if (data.exists) {
                        nameError = tt(
                            'register_jsx.account_name_already_used'
                        );
                    }
                } catch (err) {
                    nameError = tt('register_jsx.account_name_hint');
                }
            }
        }

        const { onError } = this.props
        if (onError) {
            onError(nameError)
        }
    }

    render() {
        const { value, error, onChange, onError, ...rest } = this.props
        return (<div className={error ? 'error' : ''}>
                <label>
                    {tt('register_jsx.enter_account_name')}

                    <div className='input-group'>
                        <input
                            className='input-group-field'
                            type='text'
                            name='name'
                            autoComplete='off'
                            onChange={this.onChange}
                            value={value}
                            {...rest}
                        />
                    </div>

                    <div className='Register__account-name-hint'>
                        {tt(
                            'register_jsx.account_name_hint'
                        )}
                    </div>
                </label>
                <p>{error}</p>
            </div>)
    }
}

export default AccountName
