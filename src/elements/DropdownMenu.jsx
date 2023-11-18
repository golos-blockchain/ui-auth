import React from 'react'

import VerticalMenu from '@/elements/VerticalMenu'
import { findParent } from '@/utils/DomUtils'

export default class DropdownMenu extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            shown: false,
            selected: props.selected
        };
    }

    componentWillUnmount() {
        document.removeEventListener('click', this.hide);
    }

    toggle = (e) => {
        const {shown} = this.state
        if(shown) this.hide(e)
        else this.show(e)
    }

    show = (e) => {
        e.preventDefault();
        this.setState({shown: true});
        setTimeout(() => {
            document.addEventListener('click', this.hide)
        }, 1)
    };

    hide = (e) => {
        // Do not hide the dropdown if there was a click within it.
        const inside_dropdown = !!findParent(e.target, 'VerticalMenu');
        if (inside_dropdown) return;

        e.preventDefault();
        this.setState({shown: false});
        document.removeEventListener('click', this.hide);
    };

    navigate = (e) => {
        const a = e.target.nodeName.toLowerCase() === 'a' ? e.target : e.target.parentNode;
        this.setState({show: false});
        if (a.host !== window.location.host) return;
        e.preventDefault();
        window.location.href = a.pathname + a.search
    };

    getSelectedLabel = (items, selected) => {
        const selectedEntry = items.find(i => i.value === selected)
        const selectedLabel = selectedEntry && selectedEntry.label ? selectedEntry.label : selected
        return selectedLabel
    }

    render() {
        const {el, items, selected, children, className, title, href, onClick, noArrow, hideSelected} = this.props;
        const hasDropdown = items.length > 0

        let entry = children || <span key='label'>
                {this.getSelectedLabel(items, selected)}
                {hasDropdown && !noArrow && <img src='/icons/dropdown-arrow.svg' alt='' width='20' height='20' style={{  paddingRight: '3px', marginTop: '5px', marginLeft: '2px' }}/>}
            </span>

        if(hasDropdown) entry = <a key="entry" href={href || '#'} onClick={onClick ? (e) => { onClick(e); this.toggle(e) } : this.toggle}>{entry}</a>

        const menu = <VerticalMenu key="menu" title={title} items={items} hideValue={hideSelected ? selected : null} className="VerticalMenu" />;
        const cls = 'DropdownMenu' + (this.state.shown ? ' show' : '') + (className ? ` ${className}` : '')
        return React.createElement(el, {className: cls}, [entry, menu]);
    }
}

