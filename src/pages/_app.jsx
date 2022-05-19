import tt from 'counterpart';
import golos from 'golos-lib-js';
import '@/App.scss';
import React from 'react';
import { IntlProvider } from 'react-intl'

tt.registerTranslations('en', require('@/locales/en.json'));
tt.registerTranslations('ru', require('@/locales/ru-RU.json'));

tt.setLocale((typeof(localStorage) !== 'undefined' && localStorage.getItem('locale')) || 'ru');
tt.setFallbackLocale('en');

const isBrowser = typeof window !== 'undefined';
if (isBrowser) {
    window.$GLS_IsBrowser = isBrowser;
} else {
    global.$GLS_IsBrowser = isBrowser;
}

class MyApp extends React.Component {
    state = {
    };

    async componentDidMount() {
        if (!$GLS_IsBrowser) {
            return;
        }
        try {
            await golos.importNativeLib()
        } catch (error) {
            console.error('ERROR - Cannot load golos native lib', error);
        }
        this.setState({
            nativeLibLoaded: true,
        });
    }

    render() {
        if ($GLS_IsBrowser && !this.state.nativeLibLoaded)
            return (<div></div>);
        const { Component, pageProps, } = this.props;
        const localeWithoutRegionCode = (typeof(localStorage) !== 'undefined' && localStorage.getItem('locale')) || 'ru'
        return <IntlProvider
                key={localeWithoutRegionCode}
                locale={localeWithoutRegionCode}
                defaultLocale={localeWithoutRegionCode}
            >
                <Component {...pageProps} />
            </IntlProvider>
    }
}

export default MyApp;
