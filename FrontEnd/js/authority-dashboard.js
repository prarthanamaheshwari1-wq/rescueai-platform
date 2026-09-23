console.log("Authority Dashboard Loaded");

async function loadReports() {
    console.log("Starting loadReports...");
    try {
        const response = await fetch("http://localhost:5000/api/reports", {
            cache: "no-store"
        });

        console.log("loadReports HTTP Status:", response.status);

        if (!response.ok) {
            throw new Error(`Server Error Code: ${response.status}`);
        }

        const reports = await response.json();

        let total = reports.length;

        let submitted = reports.filter(
            r => r.Status === "Submitted"
        ).length;

        let verified = reports.filter(
            r => r.Status === "Verified"
        ).length;

        let resolved = reports.filter(
            r => r.Status === "Resolved"
        ).length;

        document.getElementById("totalReports").textContent = total;

        document.getElementById("submittedReports").textContent = submitted;

        document.getElementById("verifiedReports").textContent = verified;

        document.getElementById("resolvedReports").textContent = resolved;

        console.log("Reports Data Received:", reports);

        const tableBody = document.getElementById("reportsTableBody");
        if (!tableBody) {
            console.error("ERROR: HTML mein id='reportsTableBody' wala element nahi mila!");
            return;
        }

        tableBody.innerHTML = "";

        const reportArray = Array.isArray(reports) ? reports : (reports.reports || reports.data || []);

        reportArray.forEach(report => {
            // Fix: Trim any extra spaces and clean status string
            const rawStatus = report.Status ?? report.status ?? "";
            const cleanStatus = String(rawStatus).trim() || "Submitted";

            const statusClass = cleanStatus.toLowerCase();

            tableBody.innerHTML += `
            <tr>
                <td>${report.Report_id}</td>
                <td>${report.Category || "N/A"}</td>
                <td>${report.Severity || "N/A"}</td>
                <td>${report.Location_Name || "N/A"}</td>

                <td>
                    <span class="status ${statusClass}">
                        ${cleanStatus}
                    </span>
                </td>

                <td>
                    <select id="status-${report.Report_id}">
                        <option value="Submitted" ${statusClass === "submitted" ? "selected" : ""}>Submitted</option>
                        <option value="Verified" ${statusClass === "verified" ? "selected" : ""}>Verified</option>
                        <option value="Resolved" ${statusClass === "resolved" ? "selected" : ""}>Resolved</option>
                    </select>
                </td>

                <td>
                    <button onclick="updateStatus(${report.Report_id})">
                        Update
                    </button>
                </td>

                <td>
                    <button onclick="viewReport(${report.Report_id})">
                        View
                    </button>
                </td>

            </tr>
            `;
        });

        console.log("Table render complete!");
    } catch (error) {
        console.error("X. Error in loadReports:", error.message);
    }
}

async function runDashboard() {
    await loadReports();
    console.log("BOTTOM OF FILE REACHED");
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runDashboard);
} else {
    runDashboard();
}

async function updateStatus(reportId) {
    const newStatus = document.getElementById(`status-${reportId}`).value;

    try {
        const response = await fetch(
            `http://localhost:5000/api/reports/${reportId}/status`,
            {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    status: newStatus
                })
            }
        );

        const data = await response.json();
        alert(data.message);
        await loadReports();

    } catch (error) {
        console.error(error);
    }
}

function viewReport(reportId){

    window.location.href =
        `report-details.html?id=${reportId}`;

}