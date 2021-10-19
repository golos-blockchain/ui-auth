import React from 'react';
import golos, { api, broadcast, oauth, } from 'golos-lib-js';
import ByteBuffer from 'bytebuffer';

class App extends React.Component {
    constructor(props) {
        super(props);

        const API_HOST = 'https://dev.golos.app';

        golos.config.set('oauth.client', 'proposals');
        golos.config.set('oauth.host', API_HOST);
        golos.config.set('websocket', API_HOST + '/api/oauth/sign');
        golos.config.set('credentials', 'include');

        this.state = {};
    }

    async componentDidMount() {
        const res = await oauth.checkReliable();
        this.setState({
            account: res.authorized ? res.account : null,
            allowed: res.allowed,
        });
    }

    login = () => {
        oauth.login(['custom', 'proposal_create', 'proposal_delete', 'proposal_update']);
        oauth.waitForLogin((res) => {
            if (res.authorized) {
                this.setState({
                    account: res.account,
                    allowed: res.allowed,
                });
            }
        }, () => {
            alert('Waiting for login is timeouted. Try again please.');
        });
    };

    proposalCreate = async () => {
        console.log('--- Sending proposalCreate... ---');
        const { account, } = this.state;

        const accountName = account || 'cyberfounder';
        let accs = null;
        try {
            accs = await api.getAccountsAsync([accountName]);
        } catch (err) {
            console.error('getAccounts error', err);
            return;
        }
        console.log('account is: ', accs);

        try {
            let date = new Date();
            date.setHours(date.getHours() + 1);
            date = date.toISOString().split('.')[0];

            let ops = [{
                op: [
                    'account_metadata',
                    {
                        account,
                        json_metadata: accs[0].json_metadata || '{}',
                    }
                ]
            }];

            let res = await broadcast.proposalCreateAsync(
                '(active)', account, 'test1', '',
                date,
                ops,
                undefined,
                []);
        } catch (err) {
            console.error(err);
            alert(err);
            return;
        }
        alert('Success!');
    };

    proposalUpdate = async () => {
        console.log('--- Sending proposalUpdate... ---');
        const { account, } = this.state;

        try {
            let res = await broadcast.proposalUpdateAsync(
                '', account, 'test1',
                [], [], // active accs to add, and to remove
                [], [], // owner...
                [account], [], // posting...
                [], [], // key approvals to add, and to remove
                []);
        } catch (err) {
            console.error(err);
            alert(err);
            return;
        }
        alert('Success!');
    };

    proposalDelete = async () => {
        console.log('--- Sending proposalDelete... ---');
        const { account, } = this.state;

        try {
            let res = await broadcast.proposalDeleteAsync(
                '(active)', account, 'test1',
                account, // can be author or any of approvals who has approved proposal
                []);
        } catch (err) {
            console.error(err);
            alert(err);
            return;
        }
        alert('Success!');
    };

    logout = async () => {
        await oauth.logout();
        this.setState({
            account: null,
        });
    };

    render() {
        const { account, allowed, } = this.state;
        return (
            <div className='App'>
                {account === null && <div>
                    <button onClick={this.login}>Login</button>
                </div>}
                {account && <div>
                    <div>
                        {account}
                        <button onClick={this.logout}>Logout</button>
                        <p>Allowed operations:&nbsp;
                            <span class='allowed'>{JSON.stringify(allowed)}</span></p>
                    </div>
                    <hr />
                    <button onClick={this.proposalCreate}>proposal_create</button>
                    <button onClick={this.proposalUpdate}>proposal_update</button>
                    <button onClick={this.proposalDelete}>proposal_delete</button>
                </div>}
            </div>
        );
    }
}

export default App;
