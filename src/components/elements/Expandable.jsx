import React, { Component, } from 'react';
import './Expandable.scss';

class Expandable extends Component {
    state = {
        opened: false,
    };

    onToggleExpander = () => {
        this.setState({
            opened: !this.state.opened,
        })
    };

    render() {
        const { title, isRed, rightItems, } = this.props;
        const { opened, } = this.state;
        const iconSize = '2rem';
        return (<div className={'Expandable' + (opened ? ' opened' : '')}>
            <div className='Expander' onClick={this.onToggleExpander}>
                <img className='Icon' src={'/icons/' + (opened ? 'chevron-up-circle' : 'chevron-down-circle')
                        + (isRed ? '-red' : '') + '.svg'}
                    alt=''
                    style={{ width: iconSize, height: iconSize, }} />
                <h5 className={isRed ? 'red' : ''} style={{ paddingLeft: '0.5rem', }}>{title}</h5>
                {rightItems}
            </div>
            <div className='Expandable__content'>
                {this.props.children}
            </div>
        </div>);
    }
}

export default Expandable;
