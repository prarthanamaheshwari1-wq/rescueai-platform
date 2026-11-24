
const { test } = require("node:test");
const assert = require("node:assert/strict");

const dbPath = require.resolve("../config/db");
const authPath = require.resolve("../middleware/auth");

let queryError = null;
let queryResult = { recordset: [] };
let capturedInputs = [];

class MockRequest {
    input(name, type, value) {
        capturedInputs.push({ name, type, value });
        return this;
    }

    async query(query) {
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
            Request: MockRequest,
            Int: "Int",
            NVarChar: () => "NVarChar"
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

const statusRoute = router.stack.find(
    layer =>
        layer.route?.path === "/:resourceId/status" &&
        layer.route.methods.put
);

assert.ok(statusRoute, "Resource status route must exist");

const handler = statusRoute.route.stack.at(-1).handle;

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

async function callRoute(resourceId, status) {
    capturedInputs = [];

    const req = {
        params: { resourceId },
        body: { status }
    };

    const res = createResponse();

    await handler(req, res);

    return res;
}

test("Status route rejects invalid resource ID", async () => {
    const res = await callRoute("0", "Available");

    assert.equal(res.statusCode, 400);
    assert.equal(
        res.body.message,
        "Valid resource ID is required."
    );
    assert.equal(capturedInputs.length, 0);
});

test("Status route rejects invalid status", async () => {
    const res = await callRoute("7", "Unknown");

    assert.equal(res.statusCode, 400);
    assert.equal(
        res.body.message,
        "Status must be Available or Deployed."
    );
    assert.equal(capturedInputs.length, 0);
});

test("Status route updates resource to Available", async () => {
    queryError = null;
    queryResult = {
        recordset: [{
            Resource_id: 7,
            Quantity: 3,
            Status: "Available"
        }]
    };

    const res = await callRoute("7", "available");

    assert.equal(res.statusCode, 200);
    assert.equal(
        res.body.resource.Status,
        "Available"
    );

    assert.deepEqual(capturedInputs, [
        { name: "ResourceId", type: "Int", value: 7 },
        {
            name: "RequestedStatus",
            type: "NVarChar",
            value: "Available"
        }
    ]);
});

test("Status route prevents zero-quantity resource becoming Available", async () => {
    queryResult = {
        recordset: [{
            Resource_id: 7,
            Quantity: 0,
            Status: "Deployed"
        }]
    };

    const res = await callRoute("7", "Available");

    assert.equal(res.statusCode, 400);
    assert.equal(
        res.body.message,
        "This resource has zero available units and cannot be marked Available."
    );
    assert.equal(res.body.resource.Status, "Deployed");
});

test("Status route returns 404 when resource does not exist", async () => {
    queryResult = { recordset: [] };

    const res = await callRoute("99", "Deployed");

    assert.equal(res.statusCode, 404);
    assert.equal(res.body.message, "Resource not found.");
});

test("Status route handles unexpected database errors", async () => {
    queryError = new Error("Unexpected database failure");

    const res = await callRoute("7", "Deployed");

    assert.equal(res.statusCode, 500);
    assert.equal(
        res.body.message,
        "Failed to update resource status."
    );

    queryError = null;
});
