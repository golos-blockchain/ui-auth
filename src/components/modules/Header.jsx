import React from 'react';
import PropTypes from 'prop-types';
import tt from 'counterpart';
import LocaleSelect from '../elements/LocaleSelect';

class Header extends React.Component {
    static propTypes = {
    };

    constructor(props) {
        super(props);
    }

    render() {
        const { logo, title, subtitle, } = this.props;

        return (
            <header className='Header noPrint'>
                <div className='Header__top header'>
                    <div className='row align-middle'>
                        <div className='columns'>
                            <ul className='menu'>
                                <li className='Header__top-logo'>
                                    <img src={logo} />
                                </li>
                                <li className='Header__top-title show-for-large noPrint'>
                                    <a href='#'>{title}
                                        <span className='subtitle'>{subtitle}</span></a>
                                </li>
                            </ul>
                        </div>
                        <div className='columns shrink'>
                            <LocaleSelect/>
                        </div>
                    </div>
                </div>
            </header>
        );
    }
}

export default Header;