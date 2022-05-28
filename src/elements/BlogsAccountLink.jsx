import React from 'react'

class BlogsAccountLink extends React.Component {
    render() {
        const { recoveryCfg, to } = this.props
        let link = '@' + to
        try {
            let url = new URL(link, recoveryCfg.blogs_service.host)
            return <a href={url.toString()} target='blank' rel='nofollow noopener'>{link}</a>
        } catch (err) {
            console.error('BlogsAccountLink', err)
        }
        return link
    }
}

export default BlogsAccountLink
