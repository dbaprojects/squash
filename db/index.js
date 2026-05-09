const backend = process.env.DB_BACKEND || 'sqlite';
module.exports = require(`./${backend}`);
