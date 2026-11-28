
const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const dbPath = require.resolve("../config/db");
const redisPath = require.resolve("../config/redis");

let queryResult = {
    recordset: [{
        User_id: 1,
        Role: "authority"
    }]
};

let redisSession = JSON.stringify({ userId: 1 });
let rotationResult = 1;
let capturedEval = null;
let capturedRedisGet = null;
let capturedCookies = [];
let clearedCookies = [];

class MockRequest {
    input() {
        return this;
    }

    async query() {
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

require.cache[redisPath] = {
    id: redisPath,
    filename: redisPath,
    loaded: true,
    exports: {
        redisClient: {
            async get(key) {
                capturedRedisGet = key;
                return redisSession;
            },

            async del() {
                return 1;
            },

            async eval(script, options) {
                capturedEval = { script, options };
                return rotationResult;
            }
        }
    }
};

const router = require("../routes/auth");

const refreshRoute = router.stack.find(
    layer =>
        layer.route?.path === "/refresh" &&
        layer.route.methods.post
);

assert.ok(refreshRoute, "Refresh-token route must exist");

const handler = refreshRoute.route.stack.at(-1).handle;

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
        },

        cookie(name, value, options) {
            capturedCookies.push({ name, value, options });
            return this;
        },

        clearCookie(name, options) {
            clearedCookies.push({ name, options });
            return this;
        }
    };
}

async function callRefresh(refreshToken) {
    capturedEval = null;
    capturedRedisGet = null;
    capturedCookies = [];
    clearedCookies = [];

    const req = {
        cookies: refreshToken
            ? { refreshToken }
            : {},
        headers: {}
    };

    const res = createResponse();

    await handler(req, res);

    return res;
}

test("Refresh route rejects a missing refresh token", async () => {
    const res = await callRefresh(null);

    assert.equal(res.statusCode, 401);
    assert.equal(res.body.message, "Refresh token missing");

    assert.equal(capturedRedisGet, null);
    assert.equal(capturedEval, null);
});

test("Refresh route rejects a replayed refresh token", async () => {
    redisSession = JSON.stringify({ userId: 1 });
    rotationResult = 0;

    const oldRefreshToken = "replayed-refresh-token";

    const res = await callRefresh(oldRefreshToken);

    const expectedHash = crypto
        .createHash("sha256")
        .update(oldRefreshToken)
        .digest("hex");

    assert.equal(res.statusCode, 401);
    assert.equal(
        res.body.message,
        "Refresh token is invalid or has already been used."
    );

    assert.equal(
        capturedRedisGet,
        `refresh:${expectedHash}`
    );

    assert.ok(capturedEval, "Atomic rotation must be attempted");
    assert.equal(capturedEval.options.keys.length, 3);

    assert.equal(
        capturedEval.options.keys[0],
        `refresh:${expectedHash}`
    );

    assert.equal(capturedCookies.length, 0);
    assert.equal(clearedCookies.length, 1);
});

test("Refresh route issues new tokens after successful rotation", async () => {
    redisSession = JSON.stringify({ userId: 1 });
    rotationResult = 1;

    const oldRefreshToken = "valid-refresh-token";

    const res = await callRefresh(oldRefreshToken);

    const expectedOldHash = crypto
        .createHash("sha256")
        .update(oldRefreshToken)
        .digest("hex");

    assert.equal(res.statusCode, 200);
    assert.equal(
        res.body.message,
        "Access token refreshed"
    );

    assert.ok(res.body.accessToken);
    assert.ok(capturedEval);

    const keys = capturedEval.options.keys;

    assert.equal(keys.length, 3);
    assert.equal(keys[0], `refresh:${expectedOldHash}`);

    assert.ok(
        keys[1].startsWith("refresh:"),
        "New refresh-token session key must be created"
    );

    assert.ok(
        keys[2].startsWith("access:"),
        "New access-token session key must be created"
    );

    assert.notEqual(keys[0], keys[1]);

    assert.equal(capturedCookies.length, 1);
    assert.equal(capturedCookies[0].name, "refreshToken");
    assert.ok(capturedCookies[0].value);
    assert.equal(capturedCookies[0].options.httpOnly, true);
    assert.equal(capturedCookies[0].options.path, "/");

    assert.equal(clearedCookies.length, 0);
});
