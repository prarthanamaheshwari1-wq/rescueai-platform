console.log("Map Dashboard Loaded");

let reportMarkers = [];
let highRiskCircles = [];
let resourceMarkers = [];

// Automatically matches whatever hostname the user uses (localhost or 127.0.0.1)
const API_BASE = `${window.location.protocol}//${window.location.hostname}:5000/api`;


// ==============================
// AUTHENTICATED FETCH
// ==============================

async function authenticatedFetch(url, options = {}) {

    if (window.RescueAIAuthReady) {
        await window.RescueAIAuthReady;
    }

    let token = window.RescueAIAccessToken;

    if (!token && typeof window.ensureAuthenticated === "function") {
        try {
            token = await window.ensureAuthenticated();
        } catch (err) {
            console.error("Auth helper check failed:", err);
        }
    }

    if (!token) {

        console.error("Access token not available.");

        window.location.replace(
            "authority-login.html"
        );

        throw new Error("Authentication required.");

    }

    const headers = {
        ...(options.headers || {}),
        "Authorization": `Bearer ${token}`
    };

    const response = await fetch(url, {
        ...options,
        headers,
        credentials: "include"
    });

    if (response.status === 401) {
        console.error("Unauthorized request. Redirecting to login.");
        window.location.replace("authority-login.html");
        throw new Error("Unauthorized");
    }

    return response;

}


// ==============================
// MAP INITIALIZATION
// ==============================

const map = L.map("map").setView(
    [28.938244, 77.635475],
    15
);

L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
        attribution: "&copy; OpenStreetMap contributors"
    }
).addTo(map);


// ==============================
// LOAD REPORTS ON MAP
// ==============================

async function loadReportsOnMap() {

    try {

        // Remove old report markers
        reportMarkers.forEach(item => {
            map.removeLayer(item.marker);
        });

        // Remove old high-risk circles
        highRiskCircles.forEach(item => {
            map.removeLayer(item.circle);
        });

        reportMarkers = [];
        highRiskCircles = [];

        const response = await authenticatedFetch(
            `${API_BASE}/reports`
        );

        const reports = await response.json();

        const total = reports.length;

        const pending = reports.filter(
            report =>
                report.Status === "Pending" ||
                report.Status === "Submitted"
        ).length;

        const verified = reports.filter(
            report =>
                report.Status === "Verified"
        ).length;

        const resolved = reports.filter(
            report =>
                report.Status === "Resolved"
        ).length;

        document.getElementById("totalReports")
            .textContent = total;

        document.getElementById("pendingReports")
            .textContent = pending;

        document.getElementById("verifiedReports")
            .textContent = verified;

        document.getElementById("resolvedReports")
            .textContent = resolved;

        reports.forEach(report => {

            if (
                report.Latitude &&
                report.Longitude
            ) {

                let markerColor = "green";

                if (report.Severity === "High") {
                    markerColor = "red";
                } else if (report.Severity === "Medium") {
                    markerColor = "orange";
                } else if (report.Severity === "Low") {
                    markerColor = "green";
                }

                const marker = L.circleMarker(
                    [
                        report.Latitude,
                        report.Longitude
                    ],
                    {
                        radius: report.Severity === "High" ? 14 : 10,
                        color: markerColor,
                        fillColor: markerColor,
                        fillOpacity: 0.8
                    }
                )
                    .addTo(map)
                    .bindPopup(`
                        <b>${report.Title}</b><br>
                        Report ID: ${report.Report_id}<br>
                        Category: ${report.Category}<br>
                        Severity: ${report.Severity}<br>
                        Status: ${report.Status}<br>
                        Location: ${report.Location_Name || "N/A"}<br>
                        Coordinates: ${report.Latitude}, ${report.Longitude}
                    `);

                reportMarkers.push({
                    marker: marker,
                    severity: report.Severity,
                    latitude: report.Latitude,
                    longitude: report.Longitude
                });

                if (report.Severity === "High") {

                    const highRiskCircle = L.circle(
                        [
                            report.Latitude,
                            report.Longitude
                        ],
                        {
                            radius: 500,
                            color: "red",
                            fillColor: "red",
                            fillOpacity: 0.08
                        }
                    ).addTo(map);

                    highRiskCircles.push({
                        circle: highRiskCircle,
                        severity: report.Severity
                    });

                }

            }

        });

        console.log("Disaster Reports Loaded");

    } catch (error) {

        console.error(
            "Reports Error:",
            error
        );

    }

}


// ==============================
// LOAD RESOURCES ON MAP
// ==============================

async function loadResourcesOnMap() {

    try {

        // Remove old resource markers
        resourceMarkers.forEach(marker => {
            map.removeLayer(marker);
        });

        resourceMarkers = [];

        const response = await authenticatedFetch(
            `${API_BASE}/resources`
        );

        const resources = await response.json();

        resources.forEach(resource => {

            if (
                resource.Latitude &&
                resource.Longitude
            ) {

                const resourceMarker = L.circleMarker(
                    [
                        resource.Latitude,
                        resource.Longitude
                    ],
                    {
                        radius: 8,
                        color: "blue",
                        fillColor: "blue",
                        fillOpacity: 0.9
                    }
                )
                    .addTo(map)
                    .bindPopup(`
                        <b>${resource.Resource_Name}</b><br>
                        Type: ${resource.Resource_Type}<br>
                        Quantity: ${resource.Quantity}<br>
                        Status: ${resource.Status}
                    `);

                resourceMarkers.push(resourceMarker);

            }

        });

        console.log("Resources Loaded");

    } catch (error) {

        console.error(
            "Resources Error:",
            error
        );

    }

}


// ==============================
// SEVERITY FILTER
// ==============================

const severityFilter =
    document.getElementById("severityFilter");

if (severityFilter) {

    severityFilter.addEventListener(
        "change",
        function () {

            const selectedSeverity =
                this.value;

            const selectedMarkers = [];

            reportMarkers.forEach(item => {

                if (
                    selectedSeverity === "All" ||
                    item.severity === selectedSeverity
                ) {

                    item.marker.addTo(map);

                    selectedMarkers.push([
                        item.latitude,
                        item.longitude
                    ]);

                } else {

                    map.removeLayer(item.marker);

                }

            });

            highRiskCircles.forEach(item => {

                if (
                    selectedSeverity === "All" ||
                    selectedSeverity === "High"
                ) {

                    item.circle.addTo(map);

                } else {

                    map.removeLayer(item.circle);

                }

            });

            // ==============================
            // AUTO FOCUS MAP
            // ==============================

            if (selectedSeverity !== "All") {

                if (selectedMarkers.length > 0) {

                    const bounds =
                        L.latLngBounds(selectedMarkers);

                    map.fitBounds(
                        bounds,
                        {
                            padding: [50, 50],
                            maxZoom: 15
                        }
                    );

                }

            } else {

                map.setView(
                    [28.938244, 77.635475],
                    15
                );

            }

        }
    );

}


// ==============================
// WEATHER INTELLIGENCE
// ==============================

async function loadMapWeather(city = "Delhi") {

    try {

        const response = await fetch(
            `${API_BASE}/weather?city=${encodeURIComponent(city)}`
        );

        if (!response.ok) {
            throw new Error(
                `Weather Error: ${response.status}`
            );
        }

        const data = await response.json();

        document.getElementById("mapWeatherCity")
            .textContent = data.city;

        document.getElementById("mapWeatherTemperature")
            .textContent = data.temperature + " °C";

        document.getElementById("mapWeatherHumidity")
            .textContent = data.humidity + " %";

        document.getElementById("mapWeatherWind")
            .textContent = data.windSpeed + " m/s";


        // ==============================
        // WEATHER RISK DISPLAY
        // ==============================

        const riskElement =
            document.getElementById("mapWeatherRisk");

        riskElement.textContent =
            data.riskLevel;

        const risk =
            String(data.riskLevel || "")
                .trim()
                .toLowerCase();

        if (risk === "high") {

            riskElement.style.color = "#dc3545";
            riskElement.style.fontWeight = "bold";

        } else if (risk === "medium") {

            riskElement.style.color = "#fd7e14";
            riskElement.style.fontWeight = "bold";

        } else {

            riskElement.style.color = "#198754";
            riskElement.style.fontWeight = "bold";

        }


        // ==============================
        // DISASTER DISPLAY
        // ==============================

        const disasterElement =
            document.getElementById("mapWeatherDisaster");

        disasterElement.textContent =
            data.disasterType;

        const disaster =
            String(data.disasterType || "")
                .trim()
                .toLowerCase();

        if (
            disaster === "" ||
            disaster === "none"
        ) {

            disasterElement.style.color = "#198754";
            disasterElement.style.fontWeight = "bold";

        } else {

            disasterElement.style.color = "#dc3545";
            disasterElement.style.fontWeight = "bold";

        }


        console.log(
            "Map Weather Loaded:",
            data
        );

    } catch (error) {

        console.error(
            "Map Weather Error:",
            error
        );

        document.getElementById("mapWeatherCity")
            .textContent = "Not Found";

        document.getElementById("mapWeatherTemperature")
            .textContent = "N/A";

        document.getElementById("mapWeatherHumidity")
            .textContent = "N/A";

        document.getElementById("mapWeatherWind")
            .textContent = "N/A";

        document.getElementById("mapWeatherRisk")
            .textContent = "N/A";

        document.getElementById("mapWeatherDisaster")
            .textContent = "N/A";

        document.getElementById("mapWeatherRisk")
            .style.color = "#666";

        document.getElementById("mapWeatherDisaster")
            .style.color = "#666";

    }

}


// ==============================
// WEATHER CITY SEARCH
// ==============================

function searchMapWeather() {

    const cityInput =
        document.getElementById("mapWeatherCityInput");

    const city =
        cityInput.value.trim();

    if (city === "") {

        alert("Please enter a city name.");

        return;
    }

    loadMapWeather(city);

}


// ==============================
// ENTER KEY WEATHER SEARCH
// ==============================

const weatherCityInput =
    document.getElementById("mapWeatherCityInput");

if (weatherCityInput) {

    weatherCityInput.addEventListener(
        "keypress",
        function (event) {

            if (event.key === "Enter") {

                searchMapWeather();

            }

        }
    );

}


// ==============================
// INITIAL LOAD
// ==============================

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        try {

            await window.RescueAIAuthReady;

            await loadReportsOnMap();
            await loadResourcesOnMap();
            await loadMapWeather();

        } catch (error) {

            console.error(
                "Authentication initialization failed:",
                error
            );

        }

    }
);


// ==============================
// AUTO REFRESH
// ==============================

setInterval(() => {

    console.log("Refreshing disaster intelligence...");

    loadReportsOnMap();
    loadResourcesOnMap();

}, 30000);