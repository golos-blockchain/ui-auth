fiber = require 'fiber'

PendingStates = {
    CREATED = 1,
    ACCEPTED = 2,
    FORBIDDEN = 3,
}

function oauth_bootstrap()
    box.schema.sequence.create('oauth_pendings')
    oauth_pendings = box.schema.create_space('oauth_pendings', {
        format = {
            {name = 'id', type = 'unsigned'},
            {name = 'client', type = 'STR'},
            {name = 'tx_hash', type = 'STR'},
            {name = 'tx', type = 'STR'},
            {name = 'state', type = 'unsigned'}, -- PendingStates
            {name = 'err', type = 'STR'},
            {name = 'res', type = 'STR'},
            {name = 'update', type = 'unsigned'},
            {name = 'is_readen', type = 'boolean'}, --client tab is opened, so if tx fails, not display fail by ourself 
        }
    })
    oauth_pendings:create_index('primary', {
        sequence='oauth_pendings'
    })
    oauth_pendings:create_index('by_tx', {
        type = 'tree', parts = {
            'client',
            'tx_hash',
            'state',
        }, unique = false
    })
    oauth_pendings:create_index('by_update', {
        type = 'tree', parts = {'update'}, unique = false
    })
end

function oauth_prepare_tx(client, tx_hash, tx)
    local now = fiber.clock64()
    box.space.oauth_pendings:insert{
        nil, client, tx_hash, tx,
        PendingStates.CREATED, '', '', now, false
    }
end

function oauth_get_txs(client, tx_hash, state)
    local txs = {}
    local qs = box.space.oauth_pendings.index.by_tx:select({client, tx_hash, state},
        {iterator = 'GE'})
    for i,val in ipairs(qs) do
        txs[#txs + 1] = {
            client = val.client,
            tx_hash = val.tx_hash,
            tx = val.tx,
            state = val.state,
            err = val.err,
            res = val.res,
        }
    end
    return txs
end

function oauth_modify_top_tx(client, tx_hash, func)
    local qs = box.space.oauth_pendings.index.by_tx:select{client, tx_hash}
    if #qs > 0 then
        return func(qs[1].id, qs[1])
    else
        return nil
    end
end

function oauth_update_top_tx(client, tx_hash, updater)
    return oauth_modify_top_tx(client, tx_hash, function(id)
        return box.space.oauth_pendings:update(id, updater)
    end)
end

function oauth_state_tx(client, tx_hash, state)
    return oauth_update_top_tx(client, tx_hash,
        {{'=', 'state', state}})
end

function oauth_delete_tx(client, tx_hash)
    return oauth_modify_top_tx(client, tx_hash, function(id)
        return box.space.oauth_pendings:delete(id) or {
            client = client,
            tx_hash = tx_hash,
        } -- vinyl always returns nil
    end)
end

function oauth_return_tx(client, tx_hash, err, res)
    -- TODO state not meaned
    return oauth_update_top_tx(client, tx_hash,
        {{'=', 'state', PendingStates.ACCEPTED},
        {'=', 'err', err},
        {'=', 'res', res}})
end

function oauth_cleanup()
    local now = fiber.clock64()
    local qs = box.space.oauth_pendings.index.by_update:select({1},
        {iterator = 'GE', limit = 100})
    for i,val in ipairs(qs) do
        if (now - val.update) > 300*1000000 then -- 5 minutes
            box.space.oauth_pendings:delete(val.id)
        end
    end
end
