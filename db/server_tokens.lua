fiber = require 'fiber'

function server_tokens_bootstrap()
    box.schema.sequence.create('server_tokens')
    server_tokens = box.schema.create_space('server_tokens', {
        format = {
            {name = 'id', type = 'unsigned'},
            {name = 'account', type = 'STR'},
            {name = 'client', type = 'STR'},
            {name = 'token', type = 'STR'},
            {name = 'created', type = 'unsigned'},
        }
    })
    server_tokens:create_index('primary', {
        sequence='server_tokens'
    })
    server_tokens:create_index('by_token', {
        type = 'tree', parts = {
            'token',
        }, unique = true
    })
    server_tokens:create_index('by_account_client', {
        type = 'tree', parts = {
            'account',
            'client',
        }, unique = true
    })
end

function server_tokens_create(account, client, token)
    local qs = box.space.server_tokens.index.by_account_client:select{account, client}
    if #qs == 0 then
        local now = fiber.clock64()
        box.space.server_tokens:insert{
            nil, account, client, token, now
        }
    end
end

function server_tokens_get(account, client)
    local qs = box.space.server_tokens.index.by_account_client:select{account, client}
    if #qs > 0 then
        return {
            token = qs[1].token,
            created = qs[1].created,
        }
    end
    return {}
end

function server_tokens_check(token)
    local qs = box.space.server_tokens.index.by_token:select{token}
    if #qs > 0 then
        return {
            account = qs[1].account,
            client = qs[1].client,
            token = qs[1].token,
            created = qs[1].created,
        }
    end
    return {}
end

function server_tokens_logout(account, client)
    local qs = box.space.server_tokens.index.by_account_client:select{account, client}
    if #qs > 0 then
        box.space.server_tokens:delete(qs[1].id)
    end
end

function server_tokens_logout_all(account)
    local qs = box.space.server_tokens.index.by_account_client:select{account}
    for i,val in ipairs(qs) do
        box.space.server_tokens:delete(val.id)
    end
end

