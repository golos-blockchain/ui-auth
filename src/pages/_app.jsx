import tt from 'counterpart';
import '@/App.scss';

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

export default function App({ Component, pageProps }) {
    return <Component {...pageProps} />
}
