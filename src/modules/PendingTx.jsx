import React from 'react';
import tt from 'counterpart';
import Expandable from '@/elements/Expandable';

class PendingTx extends React.Component {
    render() {
        const { tx, } = this.props;
        if (!tx || !tx.tx || !tx.tx.operations) return (<div></div>);

        let itemViews = [];
        for (let [key, data, perm] of tx.tx.operations) {
            const isActive = !perm.maxRole || perm.maxRole.includes('active');
            const isDanger = isActive || (perm.forceRed && perm.forceRed());
            let dangerNote;
            if (isDanger) {
                dangerNote = (<div className='danger-note'>{tt('g.active_key')}</div>);
            }
            itemViews.push(
                <div className={'PendingTx__item '}>
                    <Expandable isRed={isDanger}
                        title={tt('permissions.' + perm.perm)}
                        rightItems={dangerNote}>
                        {key}
                        <pre>
                            {JSON.stringify(data, null, 2)}
                        </pre>
                    </Expandable>
                </div>
            );
        }

        return (<div className='PendingTx'>
                <div>
                    {tt('oauth_request.app_want_send_op')}
                </div>
                {itemViews}
            </div>);
    }
}

export default PendingTx;
