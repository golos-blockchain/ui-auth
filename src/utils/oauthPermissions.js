
const POSTING = 'posting';
const ACTIVE = 'active';

function requires(...names) {
    return new Error('instead requires: ' + names.join(' or '));
}

function initOpsToPerms(permsToOps) {
    let res = {};
    for (const [perm, data] of Object.entries(permsToOps)) {
        for (let op of data.ops) {
            if (!res[op]) res[op] = [];
            res[op].push({perm,
                maxRole: data.maxRole || ACTIVE,
                cond: data.cond,
                forceRed: data.forceRed,
            });
        }
    }
    return res;
}

let permissions = {
    account_create: {
        ops: [
            'account_create',
            'account_create_with_delegation',
            'account_create_with_invite',
        ],
        cond: (op) => {
            return [ACTIVE, op.creator];
        },
    },
    account_update: {
        ops: [
            'account_update',
        ],
        cond: (op) => {
            if (op.owner) return false;
            return [ACTIVE, op.account];
        },
    },
    account_metadata: {
        ops: [
            'account_metadata',
        ],
        maxRole: [POSTING],
        cond: (op) => {
            return [POSTING, op.account];
        },
    },
    comment: {
        ops: [
            'comment',
            'comment_options',
        ],
        maxRole: [POSTING],
        cond: (op) => {
            return [POSTING, op.author];
        },
    },
    delete_comment: {
        ops: [
            'delete_comment',
        ],
        maxRole: [POSTING],
        cond: (op) => {
            return [POSTING, op.author];
        },
    },
    vote: {
        ops: [
            'vote',
        ],
        maxRole: [POSTING],
        cond: (op) => {
            if (!op.permlink) return requires('vote_account');
            return [POSTING, op.voter];
        },
    },
    vote_account: {
        ops: [
            'vote',
        ],
        maxRole: [POSTING],
        cond: (op) => {
            if (op.permlink) return requires('vote');
            return [POSTING, op.voter];
        },
    },
    transfer: {
        ops: [
            'transfer',
        ],
        cond: (op) => {
            return [ACTIVE, op.from];
        },
    },
    convert: {
        ops: [
            'convert',
        ],
        cond: (op) => {
            return [ACTIVE, op.owner];
        },
    },
    transfer_savings: {
        ops: [
            'transfer_to_savings',
            'transfer_from_savings',
            'cancel_transfer_from_savings',
        ],
        cond: (op) => {
            return [ACTIVE, op.from];
        },
    },
    escrow: {
        ops: [
            'escrow_transfer',
            'escrow_approve',
            'escrow_dispute',
            'escrow_release',
        ],
        cond: (op) => {
            return [ACTIVE, op.who || op.from];
        },
    },
    transfer_to_nonliq: {
        ops: [
            'transfer_to_vesting',
            'transfer_to_tip',
        ],
        cond: (op) => {
            return [ACTIVE, op.from];
        },
    },
    withdraw_vesting: {
        ops: [
            'withdraw_vesting',
            'set_withdraw_vesting_route',
        ],
        cond: (op) => {
            return [ACTIVE, op.from_account || op.account];
        },
    },
    witness: {
        ops: [
            'witness_update',
            'chain_properties_update',
            'feed_publish',
        ],
        cond: (op) => {
            return [ACTIVE, op.publisher || op.owner];
        },
    },
    witness_vote: {
        ops: [
            'account_witness_vote',
            'account_witness_proxy',
        ],
        cond: (op) => {
            return [ACTIVE, op.account];
        },
    },
    custom: {
        ops: [
            'custom',
            'custom_json',
            'custom_binary',
        ],
        maxRole: [POSTING],
        cond: (op, t) => {
            if (op.id === 'private_message') return requires('private_message');
            if (op.id === 'follow') return requires('follow_or_reblog');
            if (t === 'custom_binary') {
                if (op.required_owner_auths.length) return false;
                if (op.required_active_auths.length) return requires('custom_active');
            } else {
                if (op.required_auths.length) return false;
            }
            return [POSTING, op.required_posting_auths[0]];
        },
    },
    custom_active: {
        ops: [
            'custom',
            'custom_json',
            'custom_binary',
        ],
        maxRole: [ACTIVE],
        cond: (op, t) => {
            if (op.id === 'private_message') return requires('private_message');
            if (op.id === 'follow') return requires('follow_or_reblog');
            if (t === 'custom_binary') {
                if (op.required_owner_auths.length) return false;
                if (!op.required_active_auths.length) return requires('custom');
            } else {
                if (!op.required_auths.length) return false;
            }
            return [ACTIVE, op.required_active_auths ?
                op.required_active_auths[0] :
                op.required_auths[0]];
        },
    },
    private_message: {
        ops: [
            'custom_json',
        ],
        maxRole: [POSTING],
        cond: (op) => {
            if (op.id !== 'private_message') return requires('follow_or_reblog', 'custom_active', 'custom');
            return [POSTING, op.required_posting_auths[0]];
        },
    },
    follow_or_reblog: {
        ops: [
            'custom_json',
        ],
        maxRole: [POSTING],
        cond: (op) => {
            if (op.id !== 'follow') return requires('private_message', 'custom_active', 'custom');
            return [POSTING, op.required_posting_auths[0]];
        },
    },
    market: {
        ops: [
            'limit_order_create',
            'limit_order_create2',
            'limit_order_cancel',
            'limit_order_cancel_ex'
        ],
        cond: (op) => {
            return [ACTIVE, op.owner];
        },
    },
    delegate_vesting_shares: {
        ops: [
            'delegate_vesting_shares',
            'delegate_vesting_shares_with_interest',
            'reject_vesting_shares_delegation',
        ],
        cond: (op) => {
            return [ACTIVE, op.vesting_shares ?
                op.delegator : op.delegatee];
        },
    },
    claim: {
        ops: [
            'claim',
        ],
        maxRole: [POSTING],
        cond: (op) => {
            if (op.to !== op.from) return requires('donate');
            return [POSTING, op.from];
        }
    },
    donate: {
        ops: [
            'donate',
            'claim',
        ],
        maxRole: [POSTING],
        cond: (op) => {
            if (op.to === op.from) return requires('claim');
            return [POSTING, op.from];
        }
    },
    transfer_from_tip: {
        ops: [
            'transfer_from_tip',
        ],
        cond: (op) => {
            if (op.to !== op.from) return requires('transfer_from_tip_to_others');
            return [ACTIVE, op.from];
        }
    },
    transfer_from_tip_to_others: {
        ops: [
            'transfer_from_tip',
        ],
        cond: (op) => {
            if (op.to === op.from) return requires('transfer_from_tip');
            return [ACTIVE, op.from];
        }
    },
    invite: {
        ops: [
            'invite',
            'invite_donate',
        ],
        cond: (op) => {
            return [ACTIVE, op.from || op.creator];
        },
    },
    invite_claim: {
        ops: [
            'invite_claim',
        ],
        cond: (op) => {
            if (op.to !== op.from) return requires('invite_claim_to_others');
            return [ACTIVE, op.initiator];
        }
    },
    invite_claim_to_others: {
        ops: [
            'invite_claim',
        ],
        cond: (op) => {
            if (op.to === op.from) return requires('invite_claim');
            return [ACTIVE, op.initiator];
        }
    },
    assets: {
        ops: [
            'asset_create',
            'asset_update',
            'asset_issue',
            'asset_transfer',
            'override_transfer',
        ],
        cond: (op) => {
            return [ACTIVE, op.creator];
        }
    },
    worker_request: {
        ops: [
            'worker_request',
            'worker_request_delete',
        ],
        maxRole: [POSTING],
        cond: (op) => {
            return [POSTING, op.author];
        }
    },
    worker_request_vote: {
        ops: [
            'worker_request_vote',
        ],
        maxRole: [POSTING],
        cond: (op) => {
            return [POSTING, op.voter];
        },
        forceRed: (op) => true,
    },
    proposal_create: {
        ops: [
            'proposal_create',
        ],
        cond: (op) => {
            return [ACTIVE, op.author];
        },
    },
    proposal_delete: {
        ops: [
            'proposal_delete',
        ],
        cond: (op) => {
            return [ACTIVE, op.requester];
        },
    },
    proposal_update: {
        ops: [
            'proposal_update',
        ],
        maxRole: [POSTING],
        cond: (op) => {
            if (op.owner_approvals_to_add.length
                || op.owner_approvals_to_remove.length) {
                return false;
            }
            if (op.active_approvals_to_add.length
                || op.active_approvals_to_remove.length) {
                return false;
            }
            return [POSTING,
                op.posting_approvals_to_add.length ?
                op.posting_approvals_to_add[0] :
                op.posting_approvals_to_remove[0]];
        },
    },
    proposal_update_active: {
        ops: [
            'proposal_update',
        ],
        maxRole: [ACTIVE],
        cond: (op) => {
            if (op.owner_approvals_to_add.length
                || op.owner_approvals_to_remove.length) {
                return false;
            }
            if (!op.active_approvals_to_add.length
                && !op.active_approvals_to_remove.length) {
                return false;
            }
            return [ACTIVE,
                op.active_approvals_to_add.length ?
                op.active_approvals_to_add[0] :
                op.active_approvals_to_remove[0]];
        },
    },
};

module.exports = {
    initOpsToPerms,
    permissions,
};
