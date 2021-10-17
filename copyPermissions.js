const fs = require('fs');

let str = fs.readFileSync('server/utils/oauthPermissions.js', 'utf8');
str = str.replace('module.exports = ', 'export ');
fs.writeFileSync('src/utils/oauthPermissions.js', str);
