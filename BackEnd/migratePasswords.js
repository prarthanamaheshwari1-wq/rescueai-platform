
const bcrypt = require("bcrypt");
const { sql, connectDB } = require("./config/db");

// Only these accounts have been confirmed to use plain-text passwords.
// Do not add an account here unless its password format is verified.
const CONFIRMED_PLAINTEXT_EMAILS = [
    "rahul@gmail.com",
    "priya@gmail.com",
    "aman@gmail.com",
    "monu@gmail.com",
    "neeta@gmail.com",
    "radhika@gmail.com"
];

async function migratePasswords() {
    let connectionOpened = false;

    try {
        // Connect using the existing database configuration.
        await connectDB();

        // Verify that the connection is actually available.
        const connectionCheck = await sql.query("SELECT 1 AS Connected");

        if (connectionCheck.recordset[0].Connected !== 1) {
            throw new Error("Database connection could not be verified.");
        }

        connectionOpened = true;

        console.log("Database connection verified.");

        // Fetch only the accounts confirmed to contain plain-text passwords.
        const request = new sql.Request();

        const emailParameters = CONFIRMED_PLAINTEXT_EMAILS.map(
            (_, index) => `@Email${index}`
        );

        CONFIRMED_PLAINTEXT_EMAILS.forEach((email, index) => {
            request.input(`Email${index}`, sql.VarChar(255), email);
        });

        const result = await request.query(`
            SELECT User_id, Email, Password_Hash
            FROM Users
            WHERE Email IN (${emailParameters.join(", ")})
        `);

        let migrated = 0;
        let skipped = 0;

        for (const user of result.recordset) {
            const password = user.Password_Hash;

            if (!password) {
                console.log(`Skipped user ID ${user.User_id}: empty password.`);
                skipped++;
                continue;
            }

            // Do not hash an existing BCrypt hash again.
            const isBcrypt =
                /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(password);

            if (isBcrypt) {
                console.log(`Already hashed: ${user.Email}`);
                skipped++;
                continue;
            }

            // Hash the confirmed plain-text password.
            const hashedPassword = await bcrypt.hash(password, 10);

            const updateRequest = new sql.Request();

            updateRequest.input("UserID", sql.Int, user.User_id);
            updateRequest.input(
                "PasswordHash",
                sql.NVarChar(255),
                hashedPassword
            );

            // Update only if the password has not changed since it was read.
            updateRequest.input(
                "OriginalPassword",
                sql.NVarChar(255),
                password
            );

            const updateResult = await updateRequest.query(`
                UPDATE Users
                SET Password_Hash = @PasswordHash
                WHERE User_id = @UserID
                  AND Password_Hash = @OriginalPassword
            `);

            if (updateResult.rowsAffected[0] === 1) {
                migrated++;
                console.log(`Migrated successfully: ${user.Email}`);
            } else {
                skipped++;
                console.log(
                    `Skipped ${user.Email}: password changed or row not updated.`
                );
            }
        }

        console.log("-----------------------------------");
        console.log("Password migration finished.");
        console.log(`Migrated: ${migrated}`);
        console.log(`Skipped: ${skipped}`);
        console.log("-----------------------------------");

    } catch (error) {
        console.error("Password migration failed:", error.message);
        process.exitCode = 1;

    } finally {
        if (connectionOpened) {
            await sql.close().catch(() => {});
        }
    }
}

migratePasswords();
