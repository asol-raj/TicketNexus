const fs = require('fs/promises');
const path = require('path');
const log = console.log;


/**
 * Reads the content of a file and returns it as a string.
 * Returns null if the file path is not provided or if the file does not exist.
 *
 * @param {string} filePath - The path to the file you want to read.
 * @returns {Promise<string|null>} A promise that resolves with the file content as a string,
 * or null if the file cannot be read (e.g., not found, path not provided).
 */

// let fn = path.join(__dirname, '..', 'sql', 'InvMasterReport.sql'); log(fn);
async function readFileContent(fileName) {
  const filePath = path.join(__dirname, '..', 'sql', fileName + '.sql'); //log(filePath);
  // 1. Check if filePath is provided
  if (!filePath) {
    console.warn("readFileContent: File path was not provided.");
    return null;
  }

  try {
    // 2. Check if the file exists using fs.access
    // fs.constants.F_OK checks if the file is visible to the process
    await fs.access(filePath, fs.constants.F_OK);

    // 3. If file exists, read its content
    const data = await fs.readFile(filePath, 'utf8');
    return data;
  } catch (error) {
    // Handle specific errors
    if (error.code === 'ENOENT') { // 'ENOENT' means "Error No ENTry" (file or directory does not exist)
      console.warn(`readFileContent: File not found at "${filePath}".`);
      return null;
    } else {
      // For other errors (e.g., permissions issues), re-throw or log and return null
      console.error(`readFileContent: An unexpected error occurred reading "${filePath}":`, error.message);
      return null;
    }
  }
}

function logRejectedQuery(ip, query, reason) {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const timeStr = now.toISOString().slice(11, 19); // HH:MM:SS

    // Daily log file
    const dailyLogFile = path.join(__dirname, `rejected_queries_${dateStr}.log`);

    const logEntry = [
        "------------------------------------------------------------",
        `Time   : ${timeStr}`,
        `IP     : ${ip}`,
        `Reason : ${reason}`,
        `Query  : ${query}`,
        "------------------------------------------------------------\n"
    ].join("\n");

    fs.appendFile(dailyLogFile, logEntry, (err) => {
        if (err) console.error("Failed to write to rejection log:", err);
    });
}

module.exports = {
    readFileContent, 
    logRejectedQuery,
}