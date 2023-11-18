import React from 'react'
import tt from 'counterpart'

import NFTSmallIcon from '@/elements/nft/NFTSmallIcon'
import PagedDropdownMenu from '@/elements/PagedDropdownMenu'
import DropdownMenu from '@/elements/DropdownMenu'

export function NFTImageStub() {
    return '/images/nft.png'
}

export function parseNFTImage(json_metadata, useStub = true) {
    if (json_metadata) {
        const meta = JSON.parse(json_metadata)
        if (meta && meta.image) return meta.image
    }
    if (!useStub) return null
    return NFTImageStub()
}

class NFTTokens extends React.Component {
    render() {
        let { tokens, selected } = this.props

        let selectedItem

        const items = []
        let i = 0
        for (const token of tokens) {
            items.push({
                key: i,
                link: '#',
                value: token.token_id,
            })

            if (selected.toString() === token.token_id.toString()) {
                const image = parseNFTImage(token.json_metadata)

                let data = {}
                try {
                    data = JSON.parse(token.json_metadata)
                } catch (err) {}

                selectedItem = <React.Fragment>
                    <NFTSmallIcon image={image} />
                    &nbsp;
                    <span style={{ display: 'inline-block', marginTop: '6px' }}>
                        {data.title || '#' + token.token_id}
                    </span>
                </React.Fragment>
            }

            ++i
        }

        return <PagedDropdownMenu className='NFTTokens' el='div' items={items}
            renderItem={item => {
                const token = tokens[item.key]

                const image = parseNFTImage(token.json_metadata)

                let data = {}
                try {
                    data = JSON.parse(token.json_metadata)
                } catch (err) {}

                return {
                    ...item,
                    label: <React.Fragment>
                        <NFTSmallIcon image={image} />
                        &nbsp;
                        <span>{data.title || '#' + token.token_id}</span>
                    </React.Fragment>,
                    addon: <span style={{ position: 'absolute', right: '10px' }}>{token.name}</span>,
                    onClick: (e) => {
                        if (this.props.onItemClick)
                            this.props.onItemClick(e, token)
                    }
                }
            }}
            selected={selected}
            perPage={10}
            hideSelected={tokens.length > 1}>
            {selectedItem}
            <img src='/icons/dropdown-arrow.svg' alt='' width='20' height='20' style={{  paddingRight: '3px', marginTop: '5px', marginLeft: '2px' }} />
        </PagedDropdownMenu>
    }
}

export default NFTTokens
