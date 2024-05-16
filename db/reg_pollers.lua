fiber = require 'fiber'
decimal = require 'decimal'

function reg_pollers_migration_v1()
    if box.space.reg_pollers ~= nil then
        return
    end
    box.schema.sequence.create('reg_pollers')
    reg_pollers = box.schema.create_space('reg_pollers', {
        format = {
            {name = 'id', type = 'unsigned'},
            {name = 'sym', type = 'STR'},
            {name = 'amount', type = 'number'},
            {name = 'uid', type = 'STR'},
            {name = 'created', type = 'unsigned'},
            {name = 'init_balance', type = 'number'},
        }
    })
    reg_pollers:create_index('primary', {
        sequence='reg_pollers'
    })
    reg_pollers:create_index('by_amount', {
        type = 'tree', parts = {
            'sym',
            'amount'
        }, unique = true
    })
    reg_pollers:create_index('by_created', {
        type = 'tree', parts = {
            'created'
        }, unique = false
    })
end

local function wrap_rp(rp)
    return {
        id = rp[1],
        sym = rp[2],
        amount = rp[3],
        uid = rp[4],
        created = rp[5],
        init_bal = rp[6],
    }
end

function get_free_reg_poller(amount, sym, step, now)
    amount = decimal.new(amount) -- fix "1.1 + 0.1 ~= 1.2" problem
    local rps = nil
    repeat
        if rps ~= nil then
            local rp = wrap_rp(rps[1])
            if (now - rp['created']) >= 20*60*1000 then
                box.space.reg_pollers:delete(rp['id'])
                break
            end
            amount = amount + step
        end
        rps = box.space.reg_pollers.index.by_amount:select{sym, amount}
    until #rps == 0
    return tostring(amount)
end

local function clean_reg_pollers(now)
    for i,rp in box.space.reg_pollers.index.by_created:pairs(0, {iterator = 'GT', limit = 100}) do
        local rp = wrap_rp(rp)
        if (now - rp['created']) > 90*60*1000 then
            box.space.reg_pollers:delete(rp['id'])
        else
            break
        end
    end
end

function upsert_reg_poller(amount, sym, uid, init_bal, now)
    clean_reg_pollers(now)
    local rps = box.space.reg_pollers.index.by_amount:select{sym, amount}
    if #rps ~= 0 then
        local rp = rps[1]
        rp = wrap_rp(rp)
        if rp['uid'] ~= uid then
            return { err = 'Someone already waits for such transfer.', res = nil }
        end
        return { err = nil, res = rp }
    end
    local rp = box.space.reg_pollers:insert{nil, sym, amount, uid, now, init_bal}
    return { err = nil, res = wrap_rp(rp) }
end

function delete_reg_poller(amount, sym)
    local rps = box.space.reg_pollers.index.by_amount:select{sym, amount}
    if #rps ~= 0 then
        local rp = rps[1]
        box.space.reg_pollers:delete(rp['id'])
        return true
    end
    return false
end
