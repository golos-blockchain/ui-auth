import tt from 'counterpart';
import logo from './logo.svg';
import './App.scss';
import CreateAccount from './CreateAccount.jsx';

tt.registerTranslations('en', require('./locales/en.json'));
tt.registerTranslations('ru', require('./locales/ru-RU.json'));

tt.setLocale((typeof(localStorage) !== 'undefined' && localStorage.getItem('locale')) || 'ru');
tt.setFallbackLocale('en');

function App() {
    return (
        <div className='App'>
            <CreateAccount />
        </div>
    );
}

export default App;
