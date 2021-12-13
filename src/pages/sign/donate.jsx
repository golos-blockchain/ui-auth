import TransferDonate, { getServerSideProps as getSSP, } from '@/pages/sign/transfer';

export async function getServerSideProps(ctx) {
    return getSSP(ctx);
}

export default TransferDonate;
