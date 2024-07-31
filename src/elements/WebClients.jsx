import React from 'react'
import tt from 'counterpart'
import CloseButton from 'react-foundation-components/lib/global/close-button'
import Reveal from 'react-foundation-components/lib/global/reveal'

import AppDownload from '@/modules/app/AppDownload'

class WebClients extends React.Component {
    static propTypes = {
    }

    state = {
    }

    showAppDownload = (e) => {
        e.preventDefault()
        this.setState({
            show_app_download_modal: true
        })
    }

    hideAppDownload = () => {
        this.setState({
            show_app_download_modal: false
        })
    }

    render() {
        const { web_clients } = this.props

        const isEng = tt.getLocale() !== 'ru'

        let appList = null
        const webs = Object.entries(web_clients || {})
        if (webs.length) {
            appList = []
            for (const [en, data] of webs) {
                if (en === '_desktop') continue
                const { img, ru, url } = data
                appList.push(<a key={url} className='web-client' href={url} target='_blank' rel='noopener noreferrer'>
                    <img src={img} /><br/>
                    <div className='web-label'>{isEng ? en : ru}</div>
                </a>)
            }

            let desktop
            const { _desktop } = web_clients
            let desktopHost
            if (_desktop) {
                desktopHost = _desktop.host
                desktop = <div className='desktop'>
                    {tt('web_clients_jx.or_desktop')}
                    <a href='#' onClick={this.showAppDownload}>{tt('web_clients_jx.or_desktop_link')}</a>
                    {tt('web_clients_jx.or_desktop2')}
                </div>
            }

            const modalStyle = {
                borderRadius: '8px',
                boxShadow: '0 0 19px 3px rgba(0,0,0, 0.2)',
                overflow: 'hidden',
            }

            const { show_app_download_modal } = this.state
            appList = <div className='WebClients'>
                <h3>{tt('web_clients_jx.title')}</h3>
                {appList}
                {desktop}
                <hr/>
                <Reveal revealStyle={{ ...modalStyle, }}
                    onHide={this.hideAppDownload} show={show_app_download_modal}>
                    <CloseButton onClick={this.hideAppDownload} />
                    <AppDownload host={desktopHost} />
                </Reveal>
            </div>
        }
        return appList
    }
}

export default WebClients
