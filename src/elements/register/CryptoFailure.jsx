import React from 'react'
import tt from 'counterpart'

import { APP_DOMAIN } from '@/client_config'

class CryptoFailure extends React.Component {
    render() {
        const APP_NAME = tt('g.APP_NAME');
        return (
            <div className='row'>
                <div className='column'>
                    <div className='callout alert'>
                        <h4>
                            {tt('register_jsx.ctyptography_test_failed')}
                        </h4>
                        <p>
                            {tt(
                                'register_jsx.we_will_be_unable_to_create_account_with_this_browser',
                                { APP_NAME }
                            )}.
                        </p>
                        <p>
                            {tt('loginform_jsx.the_latest_versions_of') + ' '}
                            <a href='https://www.google.com/chrome/'>Chrome</a>
                            {' ' + tt('g.and')}
                            <a href='https://www.mozilla.org/en-US/firefox/new/'>
                                Firefox
                            </a>
                            {' ' +
                                tt(
                                    'loginform_jsx.are_well_tested_and_known_to_work_with',
                                    { APP_DOMAIN }
                                )}
                        </p>
                    </div>
                </div>
            </div>
        );
    }
}

export default CryptoFailure
