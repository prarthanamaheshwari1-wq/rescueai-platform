
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const dbPath = require.resolve("../config/db");
const authPath = require.resolve("../middleware/auth");
const uploadPath = require.resolve("../middleware/upload");

const servicePaths = [
    "../services/incidentConsistency",
    "../services/locationConsistency",
    "../services/gemini",
    "../services/imageProcessor",
    "../services/imageAuthenticity",
    "../services/imageDuplicateDetection",
    "../services/disasterCrossCheck"
].map((file) => require.resolve(file));

function installMock(modulePath, exports) {
    require.cache[modulePath] = {
        id: modulePath,
        filename: modulePath,
        loaded: true,
        exports
    };
}

test("report status and resource lifecycle changes share one transaction", async () => {
    const originalModules = new Map();

    const mockedPaths = [
        dbPath,
        authPath,
        uploadPath,
        ...servicePaths
    ];

    for (const modulePath of mockedPaths) {
        originalModules.set(modulePath, require.cache[modulePath]);
        delete require.cache[modulePath];
    }

    const originalSetTimeout = global.setTimeout;

    const transactionState = {
        began: false,
        committed: false,
        rolledBack: false,
        reportUpdateTransaction: null
    };

    class MockTransaction {
        async begin() {
            transactionState.began = true;
        }

        async commit() {
            transactionState.committed = true;
        }

        async rollback() {
            transactionState.rolledBack = true;
        }
    }

    class MockRequest {
        constructor(transaction = null) {
            this.transaction = transaction;
            this.inputs = {};
        }

        input(name, type, value) {
            this.inputs[name] = value;
            return this;
        }

        async query(query) {
            const normalizedQuery = query.toLowerCase();

            if (normalizedQuery.includes("update incident_reports")) {
                transactionState.reportUpdateTransaction =
                    this.transaction;

                return {
                    recordset: [
                        {
                            Report_id: 41,
                            Title: "Test incident",
                            Status: "Resolved"
                        }
                    ]
                };
            }

            if (normalizedQuery.includes("update r") &&
                normalizedQuery.includes("from resources r")) {
                // Simulate a failure while restoring assigned resources.
                throw new Error("Simulated resource restoration failure");
            }

            if (normalizedQuery.includes("update resource_assignments")) {
                return { recordset: [] };
            }

            // Prevent the scheduled duplicate-image backfill
            // from affecting this test.
            return { recordset: [] };
        }
    }

    installMock(dbPath, {
        sql: {
            Request: MockRequest,
            Transaction: MockTransaction,
            Int: "Int",
            NVarChar: "NVarChar",
            ISOLATION_LEVEL: {
                SERIALIZABLE: "SERIALIZABLE"
            }
        }
    });

    installMock(authPath, {
        authenticateToken: (req, res, next) => next(),
        authorizeRoles: () => (req, res, next) => next()
    });

    installMock(uploadPath, {
        single: () => (req, res, next) => next(),
        array: () => (req, res, next) => next(),
        fields: () => (req, res, next) => next(),
        none: () => (req, res, next) => next()
    });

    for (const modulePath of servicePaths) {
        installMock(modulePath, {
            checkIncidentConsistency: async () => ({}),
            checkLocationConsistency: async () => ({}),
            generateReportSafely: async () => ({}),
            processDisasterImage: async () => ({}),
            analyzeImageAuthenticity: async () => ({}),
            verifyImageSource: async () => ({}),
            matchSocialNetworkingSite: async () => ({}),
            checkImageDuplicate: async () => ({}),
            crossCheckDisasterSource: async () => ({})
        });
    }

    // Disable the 3-second backfill timer during route loading.
    global.setTimeout = () => ({});

    let router;

    try {
        router = require("../routes/reports");
    } finally {
        global.setTimeout = originalSetTimeout;
    }

    const routeLayer = router.stack.find(
        (layer) =>
            layer.route?.path === "/:reportId/status" &&
            layer.route.methods.put
    );

    assert.ok(routeLayer, "Report status PUT route should exist");

    const handler = routeLayer.route.stack.at(-1).handle;

    const req = {
        params: { reportId: "41" },
        body: { status: "Resolved" },
        user: { role: "authority" }
    };

    const response = {
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

    try {
        await handler(req, response);

        assert.equal(
            response.statusCode,
            500,
            "Resource restoration failure should return HTTP 500"
        );

        assert.equal(
            transactionState.rolledBack,
            true,
            "The resource transaction should roll back"
        );

        assert.equal(
            transactionState.committed,
            false,
            "The transaction must not commit after restoration fails"
        );

        assert.ok(
            transactionState.reportUpdateTransaction,
            "The report status update must use the same transaction as resource restoration"
        );
    } finally {
        delete require.cache[require.resolve("../routes/reports")];

        for (const modulePath of mockedPaths) {
            delete require.cache[modulePath];

            const original = originalModules.get(modulePath);

            if (original) {
                require.cache[modulePath] = original;
            }
        }
    }
});
