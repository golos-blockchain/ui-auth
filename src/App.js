import { BrowserRouter as Router, Route, Switch, } from 'react-router-dom';
import tt from 'counterpart';
import './App.scss';
import CreateAccount from './components/pages/CreateAccount.jsx';
import Login from './components/pages/Login.jsx';
import Main from './components/pages/Main.jsx';
import TransferDonate from './components/pages/TransferDonate.jsx';
import Delegate from './components/pages/Delegate.jsx';
import OAuth from './components/pages/OAuth.jsx';

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
                        <Main />
                    </Route>
                    <Route path='/login'>
                        <Login />
                    </Route>
                    <Route path='/sign/transfer'>
                        <TransferDonate action='transfer' />
                    </Route>
                    <Route path='/sign/donate'>
                        <TransferDonate action='donate' />
                    </Route>
                    <Route path='/sign/delegate_vs'>
                        <Delegate action='delegate_vs' />
                    </Route>
                    <Route path='/oauth/:client'>
                        <OAuth />
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
