const { runSql } = require("../config/config");
const Queries = require("../queries/queries");
const nodeSqlParser = require('node-sql-parser');
const { logRejectedQuery, readFileContent } = require("../service/service");
const parser = new nodeSqlParser.Parser();

async function advanceQuery(req, res) {
    try {
        let { key, values = [], type = null, srchterm = null, qry = null } = req.body;
        const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

        if (!key && !qry) throw new Error("Missing Query");

        let sql;

        if (qry) {
            sql = qry.trim().replace(/\s+/g, ' '); //log(42,sql);

            // 🚀 Quick pre-check
            if (!/^(SELECT|WITH)\b/i.test(sql)) {
                logRejectedQuery(clientIp, sql, "Does not start with SELECT/WITH");
                return res.status(400).json({
                    success: false,
                    message: "Only SELECT queries are allowed in external input."
                });
            }

            // Deep validation using SQL parser
            let ast;
            try {
                ast = parser.astify(sql, { database: 'mysql' });
            } catch (parseError) {
                logRejectedQuery(clientIp, sql, `Invalid SQL syntax: ${parseError.message}`);
                return res.status(400).json({
                    success: false,
                    message: "Invalid SQL syntax",
                    error: parseError.message
                });
            }

            const statements = Array.isArray(ast) ? ast : [ast];
            for (const stmt of statements) {
                if (stmt.type !== 'select' && stmt.type !== 'with') {
                    logRejectedQuery(clientIp, sql, `Statement type '${stmt.type}' not allowed`);
                    return res.status(400).json({
                        success: false,
                        message: "Only SELECT queries are allowed in external input."
                    });
                }
                if (stmt.type === 'with' && stmt.stmt.type !== 'select') {
                    logRejectedQuery(clientIp, sql, "WITH query not ending in SELECT");
                    return res.status(400).json({
                        success: false,
                        message: "WITH queries must end in a SELECT."
                    });
                }
                const forbiddenTypes = [
                    'insert', 'update', 'delete', 'drop',
                    'alter', 'truncate', 'create', 'replace', 'merge'
                ];
                const hasForbidden = (node) => {
                    if (!node || typeof node !== 'object') return false;
                    if (forbiddenTypes.includes(node.type)) return true;
                    return Object.values(node).some(hasForbidden);
                };
                if (hasForbidden(stmt)) {
                    logRejectedQuery(clientIp, sql, "Contains forbidden SQL operation");
                    return res.status(400).json({
                        success: false,
                        message: "Query contains forbidden operations."
                    });
                }
            }
        } else {
            // Internal trusted query
            sql = Queries[key] || (await readFileContent(key));
        }

        if (!sql) throw new Error("Missing/Invalid Query");

        // Handle search replacement
        if (type === 'search') {
            if (!srchterm) {
                return res.status(400).json({ data: [] });
            }
            const searchTermWithWildcards = `%${srchterm}%`;
            const searchCount = (sql.match(/:search/g) || []).length;
            for (let i = 0; i < searchCount; i++) {
                values.push(searchTermWithWildcards);
            }
            sql = sql.replace(/:search/g, '?');
        }

        const rsp = await runSql(sql, values);
        res.status(200).json({ data: rsp });

    } catch (error) {
        console.error("Error fetching data:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch data",
            error: error.message,
            data: []
        });
    }
}


/**
 * Builds INSERT or UPDATE SQL queries from form data
 * Auto-strips empty/null/undefined fields
 * @param {string} tableName - The target database table
 * @param {Object} data - Key/value pairs from form
 * @param {string} [pk='id'] - Primary key column to check for updates
 * @returns {Object} { sql, values, mode }
 */
function buildSaveQuery(tableName, data, pk = 'id') {
    // Strip empty/null/undefined/whitespace fields
    const cleaned = {};
    for (const [k, v] of Object.entries(data)) {
        if (
            v !== null &&
            v !== undefined &&
            !(typeof v === 'string' && v.trim() === '')
        ) {
            cleaned[k] = v;
        }
    }

    if (cleaned[pk]) {
        // UPDATE
        const fields = Object.keys(cleaned).filter(k => k !== pk);
        if (fields.length === 0) {
            throw new Error("No fields to update");
        }
        const setClause = fields.map(f => `${f} = ?`).join(', ');
        const sql = `UPDATE ${tableName} SET ${setClause} WHERE ${pk} = ?`;
        const values = fields.map(f => cleaned[f]).concat(cleaned[pk]);
        return { sql, values, mode: 'update' };
    } else {
        // INSERT
        const fields = Object.keys(cleaned);
        if (fields.length === 0) {
            throw new Error("No fields to insert");
        }
        const placeholders = fields.map(() => '?').join(', ');
        const sql = `INSERT INTO ${tableName} (${fields.join(', ')}) VALUES (${placeholders})`;
        const values = fields.map(f => cleaned[f]);
        return { sql, values, mode: 'insert' };
    }
}

/**
 * Create or update a record
 * Uses buildSaveQuery to auto-generate SQL
 */
async function createRecord(req, res) {
    try {
        const tableName = req.body.table;   // e.g. "tasks"
        const formData = req.body.data;     // { task: "Fix bug", priority: "high" }

        if (!tableName || !formData) {
            return res.status(400).json({ error: "Missing table or data" });
        }

        // Generate SQL + values
        const { sql, values, mode } = buildSaveQuery(tableName, formData);

        // Execute query
        const [result] = await db.query(sql, values);

        // Build response
        if (mode === "insert") {
            res.json({
                success: true,
                mode,
                insertedId: result.insertId
            });
        } else {
            res.json({
                success: true,
                mode,
                affectedRows: result.affectedRows
            });
        }
    } catch (err) {
        console.error("Error in createRecord:", err);
        res.status(500).json({ error: "Server error", details: err.message });
    }
}

module.exports = {
    advanceQuery, 
    buildSaveQuery
}