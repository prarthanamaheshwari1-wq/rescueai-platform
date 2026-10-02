console.log("Authority Dashboard Loaded");

async function loadReports() {

    console.log("Starting loadReports...");

    try {

        const response = await fetch(
            "http://localhost:5000/api/reports",
            {
                cache: "no-store"
            }
        );

        console.log("loadReports HTTP Status:", response.status);

        if (!response.ok) {
            throw new Error(
                `Server Error Code: ${response.status}`
            );
        }

        const reports = await response.json();

        document.getElementById("totalReports").textContent =
            reports.length;

        document.getElementById("submittedReports").textContent =
            reports.filter(
                r => r.Status === "Submitted"
            ).length;

        document.getElementById("verifiedReports").textContent =
            reports.filter(
                r => r.Status === "Verified"
            ).length;

        document.getElementById("resolvedReports").textContent =
            reports.filter(
                r => r.Status === "Resolved"
            ).length;

        document.getElementById("rejectedReports").textContent =
            reports.filter(
                r => r.Status === "Rejected"
            ).length;

        const tableBody =
            document.getElementById("reportsTableBody");

        tableBody.innerHTML = "";

        reports.forEach(report => {

            const status =
                String(report.Status || "Submitted")
                    .trim();

            const statusClass =
                status.toLowerCase();

            tableBody.innerHTML += `
                <tr>
                    <td>${report.Report_id}</td>
                    <td>${report.Category || "N/A"}</td>
                    <td>${report.Severity || "N/A"}</td>
                    <td>${report.Location_Name || "N/A"}</td>

                    <td>
                        <span class="status ${statusClass}">
                            ${status}
                        </span>
                    </td>

                    <td>
    <select
        id="status-${report.Report_id}"
        ${status === "Resolved" || status === "Rejected" ? "disabled" : ""}
    >

        ${status === "Submitted"
                    ? `
                    <option value="Submitted" selected>
                        Submitted
                    </option>

                    <option value="Verified">
                        Verified
                    </option>

                    <option value="Rejected">
                        Rejected
                    </option>

                  `
                    : ""
                }

        ${status === "Verified"
                    ? `
                    <option value="Verified" selected>
                        Verified
                    </option>

                    <option value="Resolved">
                        Resolved
                    </option>
                  `
                    : ""
                }

        ${status === "Resolved"
                    ? `
                    <option value="Resolved" selected>
                        Resolved
                    </option>
                  `
                    : ""
                }

        ${status === "Rejected"
                    ? `
                    <option value="Rejected" selected>
                        Rejected
                    </option>
                  `
                    : ""
                }

    </select>
</td>
                    <td>
    ${status === "Resolved" || status === "Rejected"
                    ? `
                <button disabled>
                    Closed
                </button>
              `
                    : `
                <button onclick="updateStatus(${report.Report_id})">
                    Update
                </button>
              `
                }
</td>
                    <td>
    ${status === "Resolved" || status === "Rejected"
                    ? `
                <button disabled>
                    Closed
                </button>
              `
                    : `
                <button onclick="assignResource(${report.Report_id})">
                    🚒 Resource
                </button>
              `
                }
</td>

<td>
    ${status === "Resolved" || status === "Rejected"
                    ? `
                <button disabled>
                    Closed
                </button>
              `
                    : `
                <button onclick="assignVolunteer(${report.Report_id})">
                    👨‍🚒 Volunteer
                </button>
              `
                }
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

        await loadAlerts();

    } catch (error) {

        console.error(
            "Error in loadReports:",
            error
        );

    }
}

async function loadAlerts() {

    console.log("Loading Alerts...");

    try {

        const response = await fetch(
            "http://localhost:5000/api/alerts",
            {
                cache: "no-store"
            }
        );

        console.log(
            "Alerts API Status:",
            response.status
        );

        const alerts = await response.json();

        console.log(
            "Alerts Received:",
            alerts
        );

        const container =
            document.getElementById(
                "alertsContainer"
            );

        console.log(
            "Container Found:",
            container
        );

        if (!container) {
            console.error(
                "alertsContainer NOT FOUND"
            );
            return;
        }

        if (!alerts || alerts.length === 0) {

            container.innerHTML = `
                <div class="card">
                    No Active Alerts
                </div>
            `;

            return;
        }

        container.innerHTML = "";

        alerts.forEach(alert => {

            container.innerHTML += `
                <div class="card">

                    <h3>
                        ⚠ ${alert.Title}
                    </h3>

                    <p>
                        ${alert.Description}
                    </p>

                    <p>
                        <strong>Location:</strong>
                        ${alert.Location_Name}
                    </p>

                    <p>
                        <strong>Severity:</strong>
                        ${alert.Severity}
                    </p>

                    <button onclick="resolveAlert(${alert.Alert_id})">
                        Resolve Alert
                    </button>

                </div>
            `;
        });

    } catch (error) {

        console.error(
            "Load Alerts Error:",
            error
        );

    }
}

async function updateStatus(reportId) {

    const statusElement =
        document.getElementById(`status-${reportId}`);

    if (!statusElement) {
        alert("Status selector not found.");
        return;
    }

    const newStatus = statusElement.value;

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

        if (!response.ok) {

            console.error(
                "Status Update Failed:",
                data
            );

            alert(
                data.message ||
                "Failed to update report status."
            );

            return;
        }

        alert(
            data.message ||
            "Report status updated successfully."
        );

        await loadReports();

    } catch (error) {

        console.error(
            "Status Update Error:",
            error
        );

        alert(
            "Unable to update report status. Please check the backend."
        );
    }
}

function viewReport(reportId) {

    window.location.href =
        `report-details.html?id=${reportId}`;
}

async function assignResource(reportId) {

    const resourceId = prompt(
        "Enter Resource ID:\n1 = Ambulance\n2 = Medical Kit\n3 = Relief Truck\n4 = Fire Brigade"
    );

    if (!resourceId) return;

    try {

        const response = await fetch(
            "http://localhost:5000/api/resources/assign",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    reportId,
                    resourceId: parseInt(resourceId)
                })
            }
        );

        const data =
            await response.json();

        alert(data.message);

    } catch (error) {

        console.error(error);

        alert("Assignment Failed");
    }
}

async function assignVolunteer(reportId) {
    const volunteerId = prompt(
        "Enter Volunteer ID:\n1 = Rahul Sharma\n2 = Priya Singh\n3 = Aman Verma"
    );

    if (!volunteerId) return;

    try {
        const response = await fetch(
            `http://localhost:5000/api/reports/${reportId}/assign-volunteer`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    volunteerId: parseInt(volunteerId)
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            alert(data.message || "Volunteer assignment failed.");
            return;
        }

        alert(data.message || "Volunteer assigned successfully.");

    } catch (error) {
        console.error("Assign Volunteer Error:", error);
        alert("Unable to assign volunteer. Please check the backend.");
    }
}

async function resolveAlert(alertId) {

    try {

        const response = await fetch(
            `http://localhost:5000/api/alerts/${alertId}/resolve`,
            {
                method: "PUT"
            }
        );

        const data = await response.json();

        alert(data.message);

        await loadAlerts();

    } catch (error) {

        console.error(
            "Resolve Alert Error:",
            error
        );

    }

}

document.addEventListener(
    "DOMContentLoaded",
    loadReports
);