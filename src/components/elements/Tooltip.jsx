import React from 'react';

const Tooltip = ({children, className, t}) => {
    return (<span title={t} className={className}>{children}</span>);
};
export default Tooltip;
