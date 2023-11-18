import React from 'react'
import Link from 'next/link'

const isExternal = (url) => {
	return /^https?:\/\//.test(url)
}

class LinkEx extends React.Component {
	render() {
		const { props } = this
		const { href, children } = props
		if (isExternal(href) || href === '#') {
			const rel = props.rel || 'noopener noreferrer'
			return <a href={href} rel={rel} {...props}>{children}</a>
		}
		return <Link {...props}><React.Fragment>{children}</React.Fragment></Link>
	}
}

export default LinkEx
