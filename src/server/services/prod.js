global.isProd = true;

const clearDelegations = require('./clearDelegations');
const clearOAuthPendings = require('./clearOAuthPendings');

clearDelegations();

clearOAuthPendings();
