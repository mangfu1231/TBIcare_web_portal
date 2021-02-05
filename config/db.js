var mysql = require('mysql');
var util = require('util');

var pool = mysql.createPool({
    connectionLimit: 64,
    // host: 'localhost',
    host: 'guopengtest3.ctumlxhoea8l.us-east-1.rds.amazonaws.com',
    user: 'root',
    password: 'Jiaze0723',
    database: 'tbi_production',
    dateStrings: true,
});

// Ping database to check for common exception errors.
pool.getConnection((err, connection) => {
    if (err) {
        if (err.code === 'PROTOCOL_CONNECTION_LOST') {
            console.error('Database connection was closed.');
        }
        if (err.code === 'ER_CON_COUNT_ERROR') {
            console.error('Database has too many connections.');
        }
        if (err.code === 'ECONNREFUSED') {
            console.error('Database connection was refused.');
        }
    }
    if (connection) connection.release();
    return;
});

pool.query = util.promisify(pool.query);
pool.getConnection = util.promisify(pool.getConnection);

module.exports = pool;

