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
    },
    account_update: {
        ops: [
            'account_update',
        ],
        cond: (op) => {
            if (op.owner) return false;
        },
    },
    account_metadata: {
        ops: [
            'account_metadata',
        ],
        maxRole: [POSTING],
        cond: (op) => {
            return POSTING;
        },
    },
    comment: {
        ops: [
            'comment',
            'comment_options',
        ],
        maxRole: [POSTING],
        cond: (op) => {
            return POSTING;
        },
    },
    delete_comment: {
        ops: [
            'delete_comment',
        ],
        maxRole: [POSTING],
        cond: (op) => {
            return POSTING;
        },
    },
    vote: {
        ops: [
            'vote',
        ],
        maxRole: [POSTING],
        cond: (op) => {
            if (!op.permlink) return requires('vote_account');
            return POSTING;
        },
    },
    vote_account: {
        ops: [
            'vote',
        ],
        maxRole: [POSTING],
        cond: (op) => {
            if (op.permlink) return requires('vote');
            return POSTING;
        },
    },
    transfer: {
        ops: [
            'transfer',
        ],
    },
    convert: {
        ops: [
            'convert',
        ],
    },
    transfer_savings: {
        ops: [
            'transfer_to_savings',
            'transfer_from_savings',
            'cancel_transfer_from_savings',
        ],
    },
    escrow: {
        ops: [
            'escrow_transfer',
            'escrow_approve',
            'escrow_dispute',
            'escrow_release',
        ],
    },
    transfer_to_nonliq: {
        ops: [
            'transfer_to_vesting',
            'transfer_to_tip',
        ],
    },
    withdraw_vesting: {
        ops: [
            'withdraw_vesting',
            'set_withdraw_vesting_route',
        ],
    },
    witness: {
        ops: [
            'witness_update',
            'chain_properties_update',
            'feed_publish',
        ],
    },
    witness_vote: {
        ops: [
            'account_witness_vote',
            'account_witness_proxy',
        ],
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
            return POSTING;
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
            return ACTIVE;
        },
    },
    private_message: {
        ops: [
            'custom_json',
        ],
        maxRole: [POSTING],
        cond: (op) => {
            if (op.id !== 'private_message') return requires('follow_or_reblog', 'custom_active', 'custom');
            return POSTING;
        },
    },
    follow_or_reblog: {
        ops: [
            'custom_json',
        ],
        maxRole: [POSTING],
        cond: (op) => {
            if (op.id !== 'follow') return requires('private_message', 'custom_active', 'custom');
            return POSTING;
        },
    },
    market: {
        ops: [
            'limit_order_create',
            'limit_order_create2',
            'limit_order_cancel',
            'limit_order_cancel_ex'
        ]
    },
    delegate_vesting_shares: {
        ops: [
            'delegate_vesting_shares',
            'delegate_vesting_shares_with_interest',
            'reject_vesting_shares_delegation',
        ],
    },
    claim: {
        ops: [
            'claim',
        ],
        maxRole: [POSTING],
        cond: (op) => {
            if (op.to !== op.from) return requires('donate');
            return POSTING;
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
            return POSTING;
        }
    },
    transfer_from_tip: {
        ops: [
            'transfer_from_tip',
        ],
        cond: (op) => {
            if (op.to !== op.from) return requires('transfer_from_tip_to_others');
            return ACTIVE;
        }
    },
    transfer_from_tip_to_others: {
        ops: [
            'transfer_from_tip',
        ],
        cond: (op) => {
            if (op.to === op.from) return requires('transfer_from_tip');
            return ACTIVE;
        }
    },
    invite: {
        ops: [
            'invite',
            'invite_donate',
        ],
    },
    invite_claim: {
        ops: [
            'invite_claim',
        ],
        cond: (op) => {
            if (op.to !== op.from) return requires('invite_claim_to_others');
            return ACTIVE;
        }
    },
    invite_claim_to_others: {
        ops: [
            'invite_claim',
        ],
        cond: (op) => {
            if (op.to === op.from) return requires('invite_claim');
            return ACTIVE;
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
    },
    worker_request: {
        ops: [
            'worker_request',
            'worker_request_delete',
        ],
        maxRole: [POSTING],
        cond: (op) => {
            return POSTING;
        }
    },
    worker_request_vote: {
        ops: [
            'worker_request_vote',
        ],
        maxRole: [POSTING],
        cond: (op) => {
            return POSTING;
        },
        forceRed: (op) => true,
    },
    proposals: {
        ops: [
            'proposal_create',
            'proposal_update',
            'proposal_delete',
        ],
    },
};

module.exports = {
    initOpsToPerms,
    permissions,
};
