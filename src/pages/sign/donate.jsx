import TransferDonate from '@/pages/sign/transfer';
import { getOAuthSession, } from '@/server/oauthSession';

export async function getServerSideProps({ req, res, }) {
    return {
        props: {
            action: 'donate',
            session: await getOAuthSession(req, res),
        },
    };
}

export default TransferDonate;
