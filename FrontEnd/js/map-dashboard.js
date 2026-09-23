console.log("Map Dashboard Loaded");

const map = L.map('map').setView([28.938244, 77.635475], 13);

L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
        attribution: '&copy; OpenStreetMap contributors'
    }
).addTo(map);

async function loadReportsOnMap() {

    try {

        const response = await fetch(
            "http://localhost:5000/api/reports"
        );

        const reports = await response.json();

        const statusBreakdown = reports.reduce((acc, r) => {
            acc[r.Status] = (acc[r.Status] || 0) + 1;
            return acc;
        }, {});
        console.log("Raw Status Breakdown from API:", statusBreakdown);

        let total = reports.length;

        let pending = reports.filter(
            r => r.Status === "Pending" || r.Status === "Submitted"
        ).length;

        let verified = reports.filter(
            r => r.Status === "Verified"
        ).length;

        let resolved = reports.filter(
            r => r.Status === "Resolved"
        ).length;

        document.getElementById("totalReports").textContent = total;

        document.getElementById("pendingReports").textContent = pending;

        document.getElementById("verifiedReports").textContent = verified;

        document.getElementById("resolvedReports").textContent = resolved;

        reports.forEach(report => {

            if(report.Latitude && report.Longitude){

                L.marker([
                    report.Latitude,
                    report.Longitude
                ])
                .addTo(map)
                .bindPopup(`
                    <b>${report.Title}</b><br>
                    ${report.Category}<br>
                    Severity: ${report.Severity}<br>
                    Status: ${report.Status}
                `);

            }

        });

        console.log("Markers Loaded");

    } catch(error){

        console.error(error);

    }
}

loadReportsOnMap();