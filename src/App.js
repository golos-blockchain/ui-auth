import { BrowserRouter as Router, Route, Switch, Redirect, } from 'react-router-dom';
import tt from 'counterpart';
import './App.scss';
import CreateAccount from './components/pages/CreateAccount.jsx';
import Login from './components/pages/Login.jsx';

tt.registerTranslations('en', require('./locales/en.json'));
tt.registerTranslations('ru', require('./locales/ru-RU.json'));

tt.setLocale((typeof(localStorage) !== 'undefined' && localStorage.getItem('locale')) || 'ru');
tt.setFallbackLocale('en');

function App() {
    return (
        <div className='App'>
            <Router>
                <Switch>
                    <Route path='/' exact={true}>
                        <Redirect to='/login' />
                    </Route>
                    <Route path='/login'>
                        <Login />
                    </Route>
                    <Route path='/:client?'>
                        <CreateAccount />
                    </Route>
                </Switch>
            </Router>
        </div>
    );
}

export default App;
