
const { test } = require("node:test");
const assert = require("node:assert/strict");

const dbPath = require.resolve("../config/db");
const plannerPath = require.resolve("../services/resourcePlanner");
const authPath = require.resolve("../middleware/auth");

let databaseError = false;
let plannerError = false;
let plannerArguments = null;

class MockRequest {
    input() {
        return this;
    }

    async query() {
        if (databaseError) {
            throw new Error("Database unavailable");
        }

        return {
            recordset: [
                {
                    Report_id: 12,
                    Category: "Flood",
                    Severity: "High",
                    Latitude: 28.367,
                    Longitude: 79.430
                }
            ]
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

require.cache[plannerPath] = {
    id: plannerPath,
    filename: plannerPath,
    loaded: true,
    exports: {
        getResourceRecommendations: async (...args) => {
            plannerArguments = args;

            if (plannerError) {
                throw new Error("Planner unavailable");
            }

            return [{ resourceType: "Vehicle", resources: [] }];
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

const recommendationRoute = router.stack.find(
    layer =>
        layer.route?.path === "/recommendations/:reportId" &&
        layer.route.methods.get
);

assert.ok(recommendationRoute, "Recommendation route must exist");

const handler = recommendationRoute.route.stack.at(-1).handle;

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

async function callRoute(reportId) {
    const req = {
        params: { reportId }
    };

    const res = createResponse();

    await handler(req, res);

    return res;
}

test("Recommendation route passes report coordinates to planner", async () => {
    databaseError = false;
    plannerError = false;
    plannerArguments = null;

    const res = await callRoute("12");

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.reportId, 12);
    assert.equal(res.body.category, "Flood");
    assert.equal(res.body.severity, "High");

    assert.deepEqual(plannerArguments, [
        "Flood",
        "High",
        28.367,
        79.430
    ]);
});

test("Recommendation route returns 404 when report is missing", async () => {
    databaseError = false;
    plannerError = false;

    MockRequest.prototype.query = async function () {
        return { recordset: [] };
    };

    const res = await callRoute("999");

    assert.equal(res.statusCode, 404);
    assert.equal(res.body.message, "Report not found.");

    MockRequest.prototype.query = async function () {
        if (databaseError) {
            throw new Error("Database unavailable");
        }

        return {
            recordset: [{
                Report_id: 12,
                Category: "Flood",
                Severity: "High",
                Latitude: 28.367,
                Longitude: 79.430
            }]
        };
    };
});

test("Recommendation route handles database errors", async () => {
    databaseError = true;
    plannerError = false;

    const res = await callRoute("12");

    assert.equal(res.statusCode, 500);
    assert.equal(
        res.body.message,
        "Failed to generate resource recommendations."
    );

    databaseError = false;
});

test("Recommendation route handles planner errors", async () => {
    databaseError = false;
    plannerError = true;

    const res = await callRoute("12");

    assert.equal(res.statusCode, 500);
    assert.equal(
        res.body.message,
        "Failed to generate resource recommendations."
    );

    plannerError = false;
});
