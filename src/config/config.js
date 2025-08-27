const pool = require("../../db");

function runSql(sql, values = []) {
    try {
        if(!sql) throw 'missing sql query!'
        const [rows, fields] = pool.query(sql, values);
        return rows;
    } catch (error) {
        console.error('Error executing query:', error.stack);
        throw error; // Re-throw the error to be caught by the caller
    }
}

module.exports = {
    runSql
}