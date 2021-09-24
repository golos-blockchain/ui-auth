export const toAsset = (value) => {
    const [ amount, symbol ] = value.split(' ')
    return { amount: parseFloat(amount), symbol }
}

export function vestsToSteem (vestingShares, gprops) {
    const { total_vesting_fund_steem, total_vesting_shares } = gprops
    const totalVestingFundSteem = toAsset(total_vesting_fund_steem).amount
    const totalVestingShares = toAsset(total_vesting_shares).amount
    const vesting_shares = toAsset(vestingShares).amount
    return (totalVestingFundSteem * (vesting_shares / totalVestingShares)).toFixed(3)
}

export function steemToVests(steem, gprops) {
    const { total_vesting_fund_steem, total_vesting_shares } = gprops
    const totalVestingFundSteem =  toAsset(total_vesting_fund_steem).amount
    const totalVestingShares =  toAsset(total_vesting_shares).amount
    const vests = steem / (totalVestingFundSteem / totalVestingShares)
    return vests.toFixed(6)
}
