import React from 'react'
import { Field, ErrorMessage, } from 'formik'
import { AssetEditor } from 'golos-lib-js/lib/utils'

class AmountField extends React.Component {
    static defaultProps = {
        name: 'amount',
    }

    _renderInput = ({ field, form }) => {
        // TODO: is it right to pass all props to input
        const { placeholder, name, ...rest } = this.props
        const { value, } = field
        const { values, setFieldTouched, setFieldValue } = form
        return <input type='text' value={value.amountStr} placeholder={placeholder}
            {...rest} onChange={(e) => this.onChange(e, values, form)}
            />
    }

    onChange = (e, values, form) => {
        const { name } = this.props
        const newAmount = values[name].withChange(e.target.value)
        if (newAmount.hasChange && newAmount.asset.amount >= 0) {
            const { setFieldTouched, setFieldValue } = form
            setFieldValue(name, newAmount)
            setFieldTouched(name, true, false)
            if (this.props.onChange) {
                this.props.onChange(newAmount.asset, form)
            }
        }
    }

    render() {
        const { placeholder, name, onChange, ...rest } = this.props
        return (<Field name={name} type='text'
            placeholder={placeholder}
            autoComplete='off' autoCorrect='off' spellCheck='false' {...rest}>
                {this._renderInput}
            </Field>)
    }
}

export default AmountField
