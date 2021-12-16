import React from 'react';
import Link from 'next/link';
import LocaleSelect from '@/elements/LocaleSelect';
import AccountMenu from '@/elements/AccountMenu';

class Header extends React.Component {
    static propTypes = {
    };

    render() {
        const { title, titleUppercase, subtitle, logoUrl, 
            topRight, account, } = this.props;

        let logo = this.props.logo;
        let sublogo = this.props.sublogo;
        if (!logo && !sublogo && !title && !subtitle) {
            logo = '/images/signer1.png';
            sublogo = '/images/signer2.png';
        }
        return (
            <header className='Header noPrint'>
                <div className='Header__top header'>
                    <div className='row align-middle'>
                        <div className='columns'>
                            <ul className='menu'>
                                <li className='Header__top-logo'>
                                    <Link href={logoUrl}>
                                        <img src={logo} alt='' style={{ cursor: 'pointer', }} />
                                    </Link>
                                    {sublogo ? <Link href={logoUrl}>
                                        <img className='sublogo' src={sublogo} alt='' style={{ cursor: 'pointer', }} />
                                        </Link> : null}
                                </li>
                                <li className={'Header__top-title show-for-large noPrint ' + (titleUppercase === false ? '': 'uppercase')}>
                                    <a>
                                        {title ? <Link href={logoUrl}>
                                            {title}
                                        </Link> : null}
                                        <Link href={logoUrl}>
                                            <span className='subtitle'>{subtitle}</span>
                                        </Link>
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