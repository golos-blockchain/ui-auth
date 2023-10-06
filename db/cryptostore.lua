fiber = require 'fiber'

function cryptostore_bootstrap()
    box.schema.sequence.create('cryptostore')
    cryptostore = box.schema.create_space('cryptostore', {
        format = {
            {name = 'id', type = 'unsigned'},
            {name = 'account', type = 'STR'},
            {name = 'key', type = 'STR'},
            {name = 'created', type = 'unsigned'},
        }
    })
    cryptostore:create_index('primary', {
        sequence='cryptostore'
    })
    cryptostore:create_index('by_account', {
        type = 'tree', parts = {
            'account',
        }, unique = true
    })
end

function cryptostore_insert(account, key)
    local now = fiber.clock64()
    box.space.cryptostore:insert{
        nil, account, key, now
    }
end

function cryptostore_get(account)
    local rec = box.space.cryptostore.index.by_account:select{account}
    return rec
end
