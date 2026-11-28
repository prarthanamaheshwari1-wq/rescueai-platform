const { test } = require("node:test");
const assert = require("node:assert/strict");

const dbPath = require.resolve("../config/db");
const redisPath = require.resolve("../config/redis");

let queryError = null;
let queryResult = { recordset: [] };
let redisValue = null;
let deletedKeys = [];
let capturedInputs = [];

class MockRequest {
    input(name, type, value) {
        capturedInputs.push({ name, type, value });
        return this;
    }

    async query() {
        if (queryError) {
            throw queryError;
        }

        return queryResult;
    }
}

const mockRedisClient = {
    async get() {
        return redisValue;
    },

    async del(key) {
        deletedKeys.push(key);
        return 1;
    }
};

require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
        sql: {
            Request: MockRequest,
            Int: "Int"
        }
    }
};

require.cache[redisPath] = {
    id: redisPath,
    filename: redisPath,
    loaded: true,
    exports: {
        redisClient: mockRedisClient
    }
};

const {
    authenticateToken,
    authorizeRoles
} = require("../middleware/auth");

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

function createRequest(token = null) {
    return {
        headers: token
            ? { authorization: `Bearer ${token}` }
            : {},
        user: undefined
    };
}

function resetMocks() {
    queryError = null;
    queryResult = { recordset: [] };
    redisValue = null;
    deletedKeys = [];
    capturedInputs = [];
}

test("Authentication rejects a missing access token", async () => {
    resetMocks();

    const req = createRequest();
    const res = createResponse();
    let nextCalled = false;

    await authenticateToken(req, res, () => {
        nextCalled = true;
    });

    assert.equal(res.statusCode, 401);
    assert.equal(nextCalled, false);
});

test("Authentication rejects an invalid or expired session", async () => {
    resetMocks();

    const req = createRequest("invalid-token");
    const res = createResponse();

    await authenticateToken(req, res, () => {});

    assert.equal(res.statusCode, 401);
    assert.equal(
        res.body.message,
        "Invalid or expired access token."
    );
});

test("Authentication deletes malformed Redis session data", async () => {
    resetMocks();

    redisValue = "{invalid-json";

    const req = createRequest("test-token");
    const res = createResponse();

    await authenticateToken(req, res, () => {});

    assert.equal(res.statusCode, 401);
    assert.equal(deletedKeys.length, 1);
    assert.match(deletedKeys[0], /^access:/);
});

test("Authentication sets the current database user and role", async () => {
    resetMocks();

    redisValue = JSON.stringify({ userId: 7 });

    queryResult = {
        recordset: [
            {
                User_id: 7,
                Role: " Authority "
            }
        ]
    };

    const req = createRequest("valid-token");
    const res = createResponse();
    let nextCalled = false;

    await authenticateToken(req, res, () => {
        nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.deepEqual(req.user, {
        id: 7,
        role: "authority"
    });
});

test("Role authorization rejects users without permission", () => {
    const req = {
        user: {
            id: 7,
            role: "citizen"
        }
    };

    const res = createResponse();
    let nextCalled = false;

    authorizeRoles("authority")(req, res, () => {
        nextCalled = true;
    });

    assert.equal(res.statusCode, 403);
    assert.equal(nextCalled, false);
});

test("Role authorization allows an authorized user", () => {
    const req = {
        user: {
            id: 7,
            role: "authority"
        }
    };

    const res = createResponse();
    let nextCalled = false;

    authorizeRoles("authority")(req, res, () => {
        nextCalled = true;
    });

    assert.equal(nextCalled, true);
});