
const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");
const { sql } = require("../config/db");

const {
    crossCheckDisasterSource
} = require("../services/disasterCrossCheck");

const originalApiKey = process.env.OPENWEATHER_API_KEY;
const originalAxiosGet = axios.get;
const originalQuery = sql.Request.prototype.query;

let mockWeather;
let mockAlerts;

test.beforeEach(() => {
    process.env.OPENWEATHER_API_KEY = "test-api-key";

    mockWeather = {
        weather: [
            {
                main: "Clear",
                description: "clear sky"
            }
        ],
        main: {
            temp: 25
        },
        wind: {
            speed: 3
        }
    };

    mockAlerts = [];

    axios.get = async () => ({
        data: mockWeather
    });

    sql.Request.prototype.query = async () => ({
        recordset: mockAlerts
    });
});

test.afterEach(() => {
    axios.get = originalAxiosGet;
    sql.Request.prototype.query = originalQuery;

    if (originalApiKey === undefined) {
        delete process.env.OPENWEATHER_API_KEY;
    } else {
        process.env.OPENWEATHER_API_KEY = originalApiKey;
    }
});

test("missing API key returns unavailable", async () => {
    delete process.env.OPENWEATHER_API_KEY;

    const result = await crossCheckDisasterSource({
        category: "Flood",
        locationName: "Bareilly",
        latitude: 28.367,
        longitude: 79.430
    });

    assert.equal(result.status, "unavailable");
    assert.match(result.message, /API key not configured/i);
});

test("rain-related weather provides supporting evidence for flood reports", async () => {
    mockWeather.weather[0] = {
        main: "Rain",
        description: "heavy intensity rain"
    };

    const result = await crossCheckDisasterSource({
        category: "Flood",
        locationName: "Bareilly",
        latitude: 28.367,
        longitude: 79.430
    });

    assert.equal(result.status, "supporting_evidence");
    assert.match(result.message, /precipitation-related/i);
});

test("matching active disaster alert provides supporting evidence", async () => {
    mockAlerts = [
        {
            Title: "Flood warning in Bareilly",
            Description: "Waterlogging reported in low-lying areas",
            Alert_Type: "Flood",
            Severity: "High"
        }
    ];

    const result = await crossCheckDisasterSource({
        category: "Flood",
        locationName: "Bareilly",
        latitude: 28.367,
        longitude: 79.430
    });

    assert.equal(result.status, "supporting_evidence");
    assert.equal(
        result.matchedAlert,
        "Flood warning in Bareilly"
    );
});

test("unrelated active alert does not support a flood report", async () => {
    mockAlerts = [
        {
            Title: "Earthquake warning",
            Description: "Seismic activity reported",
            Alert_Type: "Earthquake",
            Severity: "High"
        }
    ];

    const result = await crossCheckDisasterSource({
        category: "Flood",
        locationName: "Bareilly",
        latitude: 28.367,
        longitude: 79.430
    });

    assert.equal(result.status, "no_direct_correlation");
    assert.equal(result.matchedAlert, null);
});

test("weather API failure returns unavailable without throwing", async () => {
    axios.get = async () => {
        throw new Error("Weather API unavailable");
    };

    const result = await crossCheckDisasterSource({
        category: "Flood",
        locationName: "Bareilly",
        latitude: 28.367,
        longitude: 79.430
    });

    assert.equal(result.status, "unavailable");
    assert.match(result.message, /temporarily unavailable/i);
});

test("matching high temperature supports a heat incident", async () => {
    mockWeather.main.temp = 42;

    const result = await crossCheckDisasterSource({
        category: "Heatwave",
        locationName: "Bareilly",
        latitude: 28.367,
        longitude: 79.430
    });

    assert.equal(result.status, "supporting_evidence");
    assert.match(result.message, /42°C/);
});

test("database alert query failure does not crash weather cross-check", async () => {
    sql.Request.prototype.query = async () => {
        throw new Error("Database unavailable");
    };

    const result = await crossCheckDisasterSource({
        category: "Flood",
        locationName: "Bareilly",
        latitude: 28.367,
        longitude: 79.430
    });

    assert.equal(result.status, "no_direct_correlation");
});
