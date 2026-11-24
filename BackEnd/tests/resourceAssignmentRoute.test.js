
const { test } = require("node:test");
const assert = require("node:assert/strict");

const dbPath = require.resolve("../config/db");
const authPath = require.resolve("../middleware/auth");

let queryError = null;
let capturedInputs = [];
let capturedQuery = "";

class MockRequest {
    input(name, type, value) {
        capturedInputs.push({ name, type, value });
        return this;
    }

    async query(query) {
        capturedQuery = query;

        if (queryError) {
            throw queryError;
        }

        return {
            recordset: [{ Assignment_id: 101 }]
        };
    }
}

require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
        sql: {
            Request: MockRequest,
            Int: "Int",
            NVarChar: "NVarChar"
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

const assignmentRoute = router.stack.find(
    layer => layer.route?.path === "/assign" &&
        layer.route.methods.post
);

assert.ok(assignmentRoute, "Assignment route must exist");

const handler = assignmentRoute.route.stack.at(-1).handle;

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

async function callRoute(body) {
    capturedInputs = [];
    capturedQuery = "";

    const req = { body };
    const res = createResponse();

    await handler(req, res);

    return res;
}

test("Assignment route rejects invalid report ID", async () => {
    const res = await callRoute({
        reportId: 0,
        resourceId: 5
    });

    assert.equal(res.statusCode, 400);
    assert.equal(
        res.body.message,
        "Valid report ID and resource ID are required."
    );
    assert.equal(capturedInputs.length, 0);
});

test("Assignment route rejects invalid resource ID", async () => {
    const res = await callRoute({
        reportId: 12,
        resourceId: -1
    });

    assert.equal(res.statusCode, 400);
    assert.equal(capturedInputs.length, 0);
});

test("Assignment route sends IDs and executes transactional assignment", async () => {
    queryError = null;

    const res = await callRoute({
        reportId: 12,
        resourceId: 7
    });

    assert.equal(res.statusCode, 200);
    assert.equal(
        res.body.message,
        "Resource assigned successfully."
    );
    assert.equal(res.body.assignmentId, 101);

    assert.deepEqual(capturedInputs, [
        { name: "ReportId", type: "Int", value: 12 },
        { name: "ResourceId", type: "Int", value: 7 }
    ]);

    assert.match(capturedQuery, /BEGIN TRANSACTION/i);
    assert.match(capturedQuery, /INSERT INTO Resource_Assignments/i);
    assert.match(capturedQuery, /UPDATE Resources/i);
    assert.match(capturedQuery, /Quantity = Quantity - 1/i);
    assert.match(capturedQuery, /COMMIT TRANSACTION/i);
    assert.match(capturedQuery, /ROLLBACK TRANSACTION/i);
});

test("Assignment route maps expected database errors", async (t) => {
    const expectedErrors = [
        [50001, 404, "Report not found."],
        [50002, 404, "Resource not found."],
        [50003, 400, "Resource is not available."],
        [50004, 400, "Resource quantity is exhausted."],
        [50005, 409, "This resource is already assigned to this report."],
        [50006, 409, "Resources cannot be assigned to a rejected or resolved report."]
    ];

    for (const [number, status, message] of expectedErrors) {
        await t.test(`SQL error ${number} returns ${status}`, async () => {
            queryError = Object.assign(
                new Error(message),
                { number }
            );

            const res = await callRoute({
                reportId: 12,
                resourceId: 7
            });

            assert.equal(res.statusCode, status);
            assert.equal(res.body.message, message);
        });
    }

    queryError = null;
});

test("Assignment route handles unexpected database errors", async () => {
    queryError = new Error("Unexpected database failure");

    const res = await callRoute({
        reportId: 12,
        resourceId: 7
    });

    assert.equal(res.statusCode, 500);
    assert.equal(
        res.body.message,
        "Failed to assign resource."
    );

    queryError = null;
});
