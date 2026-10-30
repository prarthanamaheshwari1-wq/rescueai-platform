
const { sql, connectDB } = require("./config/db");

async function main() {
    await connectDB();

    const result = await new sql.Request().query(`
        SELECT COLUMN_NAME, DATA_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'Image_Duplicate_Checks'
        ORDER BY ORDINAL_POSITION
    `);

    console.table(result.recordset);
}

main()
    .catch(error => {
        console.error("Database check failed:", error.message);
        process.exitCode = 1;
    });
