import React from 'react';
import { LinkWithTooltip } from 'react-foundation-components/lib/global/tooltip';

export default ({children, className, t}) => {
    return (<span title={t} className={className}>{children}</span>);
}
