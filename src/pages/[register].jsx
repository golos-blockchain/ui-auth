import React from 'react';
import { redirect, } from '@/server/misc';

export async function getServerSideProps({ req, res, params, }) {
    return redirect('/register/' + params.register);
}

class Empty extends React.Component {
    render() {
        return null;
    }
}

export default Empty;
