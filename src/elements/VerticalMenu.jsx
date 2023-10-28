import React from 'react';

import LinkEx from '@/utils/LinkEx'

export default class VerticalMenu extends React.Component {
    closeMenu = (e) => {
        // If this was not a left click, or if CTRL or CMD were held, do not close the menu.
        if(e.button !== 0 || e.ctrlKey || e.metaKey) return;

        // Simulate clicking of document body which will close any open menus
        document.body.click();
    }

    render() {
        const {items, title, description, className, hideValue} = this.props;
        return <ul className={'VerticalMenu menu vertical' + (className ? ' ' + className : '')}>
            {title && <li className="title">{title}</li>}
            {description && <li className="description">{description}</li>}
            {items.map((i, k) => {
                if(i.value === hideValue) return null
                const target = i.target
                return <li data-link={i.link} data-value={i.value} key={i.key ? i.key : i.value} onClick={i.link ? this.closeMenu : null} style={i.style}>
                    {i.link ? <LinkEx href={i.link} target={target} onClick={i.onClick}>
                        {i.icon}{i.label ? i.label : i.value}
                        {i.data && <span>{i.data}</span>}
                        &nbsp; {i.addon}
                    </LinkEx> :
                    <span>
                        {i.icon}{i.label ? i.label : i.value}
                    </span>
                    }
                </li>
            })}
        </ul>;
    }
}
