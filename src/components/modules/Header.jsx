import React from 'react';
import LocaleSelect from '../elements/LocaleSelect';
import AccountMenu from '../elements/AccountMenu';

class Header extends React.Component {
    static propTypes = {
    };

    onLogoClick = (e) => {
        const { logoUrl, } = this.props;
        window.location.href = logoUrl;
    }

    render() {
        const { title, titleUppercase, subtitle, logoUrl, 
            topRight, account, } = this.props;

        let logo = this.props.logo;
        if (!logo && !title && !subtitle) {
            logo = '/images/signer.png';
        }
        return (
            <header className='Header noPrint'>
                <div className='Header__top header'>
                    <div className='row align-middle'>
                        <div className='columns'>
                            <ul className='menu'>
                                <li className='Header__top-logo'>
                                    <img src={logo} alt='' onClick={this.onLogoClick} style={{ cursor: 'pointer', }} />
                                </li>
                                <li className={'Header__top-title show-for-large noPrint ' + (titleUppercase === false ? '': 'uppercase')}>
                                    <a href={logoUrl}>
                                        {title}
                                        <span className='subtitle'>{subtitle}</span>
                                    </a>
                                </li>
                            </ul>
                        </div>
                        <div className='columns shrink'>
                            <LocaleSelect/>
                        </div>
                        {topRight || <AccountMenu account={account} />}
                    </div>
                </div>
            </header>
        );
    }
}

export default Header;