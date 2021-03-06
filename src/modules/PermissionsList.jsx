import React from 'react';
import tt from 'counterpart';

class PermissionsList extends React.Component {
    render() {
        const { items, } = this.props;
        if (!items) return (<div></div>);

        let itemViews = [];
        for (let [key, data] of items) {
            const isActive = !data.maxRole || data.maxRole.includes('active');
            const isDanger = isActive || (data.forceRed && data.forceRed());
            itemViews.push(
                <div key={key} className={'PermissionsList__item ' + (isDanger ? ' danger' : '')}>
                    <span className='bull'>&bull;</span>
                    {tt('permissions.' + key)}
                    {isActive && <div className='note'>{tt('g.active_key')}</div>}
                </div>
            );
        }

        return (<div className='PermissionsList'>
                {itemViews}
            </div>);
    }
}

export default PermissionsList;
