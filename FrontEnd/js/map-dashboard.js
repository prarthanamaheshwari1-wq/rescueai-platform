console.log("Map Dashboard Loaded");

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

async function loadReportsOnMap() {

    try {

        const response = await fetch(
            "http://localhost:5000/api/reports"
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

                let markerColor = "red";

                if (report.Status === "Verified") {

                    markerColor = "green";

                } else if (
                    report.Status === "Resolved"
                ) {

                    markerColor = "blue";

                }

                L.circleMarker(
                    [
                        report.Latitude,
                        report.Longitude
                    ],
                    {
                        radius: 10,
                        color: markerColor,
                        fillColor: markerColor,
                        fillOpacity: 0.8
                    }
                )
                .addTo(map)
                .bindPopup(`
                    <b>${report.Title}</b><br>
                    Category: ${report.Category}<br>
                    Severity: ${report.Severity}<br>
                    Status: ${report.Status}
                `);

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

async function loadResourcesOnMap() {

    try {

        const response = await fetch(
            "http://localhost:5000/api/resources"
        );

        const resources = await response.json();

        resources.forEach(resource => {

            if (
                resource.Latitude &&
                resource.Longitude
            ) {

                L.circleMarker(
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

loadReportsOnMap();
loadResourcesOnMap();