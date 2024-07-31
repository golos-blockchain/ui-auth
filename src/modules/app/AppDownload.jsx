import React from 'react'
import tt from 'counterpart'

import QRCode from '@/elements/QrCode'

class AppDownload extends React.Component {
    componentDidMount() {
    }

    render() {
        const updaterHost = this.props.host
        if (!updaterHost) return null
        const winUrl = new URL('/api/exe/desktop/windows/latest', updaterHost).toString()
        const linuxUrl = new URL('/api/exe/desktop/linux/latest', updaterHost).toString()
        const androidUrl = new URL('/api/exe/messenger/android/latest', updaterHost).toString()
        return <div>
            <h4>{tt('app_download.title')}</h4>
            <a href={winUrl} target='_blank' rel='nofollow noreferrer' title={tt('app_download.download_for') + ' Windows'}>
                <img src={'/images/windows.png'} />
                Windows
            </a><br />
            <a href={linuxUrl} title={tt('app_download.download_for') + ' Linux'}>
                <img src={'/images/linux.png'} />
                Linux (deb)
            </a><br />
            <a href={androidUrl} title={tt('app_download.download_for') + ' Android'}>
                <img src={'/images/android48x48.png'} />
                {tt('app_download.messenger')}Android&nbsp;&nbsp;
                <QRCode text={androidUrl} size={2} />
            </a>
        </div>
    }
}

export default AppDownload
