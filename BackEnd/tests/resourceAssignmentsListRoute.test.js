
const { test } = require("node:test");
const assert = require("node:assert/strict");

const dbPath = require.resolve("../config/db");
const authPath = require.resolve("../middleware/auth");

let queryError = null;
let queryResult = { recordset: [] };
let capturedQuery = "";

class MockRequest {
    async query(query) {
        capturedQuery = query;

        if (queryError) {
            throw queryError;
        }

        return queryResult;
    }
}

require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
        sql: {
            Request: MockRequest
        }
    }
};

require.cache[authPath] = {
    id: authPath,
    filename: authPath,
    loaded: true,
    exports: {
        authenticateToken: (req, res, next) => next(),
        authorizeRoles: () => (req, res, next) => next()
    }
};

const router = require("../routes/resources");

const assignmentsRoute = router.stack.find(
    layer =>
        layer.route?.path === "/assignments" &&
        layer.route.methods.get
);

assert.ok(assignmentsRoute, "Assignments listing route must exist");

const handler = assignmentsRoute.route.stack.at(-1).handle;

function createResponse() {
    return {
        statusCode: 200,
        body: null,

        status(code) {
            this.statusCode = code;
            return this;
        },

        json(data) {
            this.body = data;
            return this;
        }
    };
}

async function callRoute() {
    const req = {};
    const res = createResponse();

    await handler(req, res);

    return res;
}

test("Assignments route returns assignment and resource details", async () => {
    queryError = null;

    queryResult = {
        recordset: [
            {
                Assignment_id: 12,
                Report_id: 5,
                Resource_id: 7,
                Status: "Active",
                Resource_Name: "Medical Kit",
                Resource_Type: "Medical",
                Quantity: 4,
                Location_Name: "Relief Center",
                Resource_Status: "Available"
            }
        ]
    };

    const res = await callRoute();

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, queryResult.recordset);

    assert.match(capturedQuery, /FROM Resource_Assignments RA/i);
    assert.match(capturedQuery, /INNER JOIN Resources R/i);
    assert.match(capturedQuery, /ORDER BY RA\.Assignment_id DESC/i);
});

test("Assignments route returns an empty array when no assignments exist", async () => {
    queryError = null;
    queryResult = { recordset: [] };

    const res = await callRoute();

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, []);
});

test("Assignments route handles unexpected database errors", async () => {
    queryError = new Error("Unexpected database failure");

    const res = await callRoute();

    assert.equal(res.statusCode, 500);
    assert.equal(
        res.body.message,
        "Failed to fetch resource assignments."
    );

    queryError = null;
});
