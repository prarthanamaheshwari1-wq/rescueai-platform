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

    try {


        // ==========================================
        // GET INTELLIGENT RESOURCE RECOMMENDATIONS
        // ==========================================

        const recommendationResponse = await fetch(
            `http://localhost:5000/api/resources/recommendations/${reportId}`,
            {
                cache: "no-store"
            }
        );

        if (recommendationResponse.ok) {

            const recommendationData =
                await recommendationResponse.json();

            const recommendedTypes =
                recommendationData.recommendations
                    .map(item => item.resourceType)
                    .join(", ");

            if (recommendedTypes) {

                alert(
                    "AI Resource Recommendation:\n\n" +
                    recommendedTypes +
                    "\n\nYou can now choose a resource from the available list."
                );

            }
        }


        // Get actual resources from the database
        const resourcesResponse = await fetch(
            "http://localhost:5000/api/resources",
            {
                cache: "no-store"
            }
        );

        if (!resourcesResponse.ok) {
            throw new Error(
                `Resources API Error: ${resourcesResponse.status}`
            );
        }

        const resources =
            await resourcesResponse.json();

        // Show only resources with available quantity
        const availableResources =
            resources.filter(resource =>
                Number(resource.Quantity || 0) > 0
            );

        if (availableResources.length === 0) {

            alert(
                "No resources are currently available."
            );

            return;
        }

        // Create a list using actual database resources
        const resourceList =
            availableResources
                .map(resource =>
                    `${resource.Resource_id} = ${resource.Resource_Name} (${resource.Resource_Type}, Qty: ${resource.Quantity})`
                )
                .join("\n");

        const resourceId =
            prompt(
                "Enter Resource ID:\n\n" +
                resourceList
            );

        if (!resourceId) return;

        const selectedResourceId =
            parseInt(resourceId);

        if (isNaN(selectedResourceId)) {

            alert(
                "Please enter a valid Resource ID."
            );

            return;
        }

        // Check whether the entered Resource ID exists
        const selectedResource =
            availableResources.find(
                resource =>
                    Number(resource.Resource_id) ===
                    selectedResourceId
            );

        if (!selectedResource) {

            alert(
                "Invalid Resource ID. Please select an ID from the list."
            );

            return;
        }

        // Assign the selected resource to the report
        const response = await fetch(
            `http://localhost:5000/api/reports/${reportId}/assign-resource`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    reportId,
                    resourceId: selectedResourceId
                })
            }
        );

        const data =
            await response.json();

        if (!response.ok) {

            alert(
                data.message ||
                "Resource assignment failed."
            );

            return;
        }

        alert(
            data.message ||
            "Resource assigned successfully."
        );

        // Reload reports after assignment
        await loadReports();

    } catch (error) {

        console.error(
            "Assign Resource Error:",
            error
        );

        alert(
            "Unable to assign resource. Please check the backend."
        );
    }
}

async function assignVolunteer(reportId) {

    try {

        // Get all volunteers
        const volunteersResponse = await fetch(
            "http://localhost:5000/api/volunteers",
            {
                cache: "no-store"
            }
        );

        if (!volunteersResponse.ok) {
            throw new Error(
                `Volunteers API Error: ${volunteersResponse.status}`
            );
        }

        const volunteers =
            await volunteersResponse.json();


        if (!volunteers || volunteers.length === 0) {

            alert(
                "No volunteers are currently registered."
            );

            return;
        }


        // Show ALL volunteers with their current status
        const volunteerList =
            volunteers
                .map(volunteer => {

                    const availability =
                        String(
                            volunteer.Availability || "Unknown"
                        )
                            .trim()
                            .toLowerCase();

                    const status =
                        availability === "available"
                            ? "Available"
                            : "Busy";

                    return (
                        `${volunteer.Volunteer_id} = ` +
                        `${volunteer.FullName || volunteer.fullName || "Volunteer"} ` +
                        `(${volunteer.Skills || "No skill listed"}) - ` +
                        `${status}`
                    );

                })
                .join("\n");


        const volunteerId =
            prompt(
                "Enter Volunteer ID:\n\n" +
                volunteerList +
                "\n\nAvailable volunteers can be assigned."
            );


        if (!volunteerId) return;


        const selectedVolunteerId =
            parseInt(volunteerId);


        if (isNaN(selectedVolunteerId)) {

            alert(
                "Please enter a valid Volunteer ID."
            );

            return;
        }


        // Find selected volunteer
        const selectedVolunteer =
            volunteers.find(
                volunteer =>
                    Number(volunteer.Volunteer_id) ===
                    selectedVolunteerId
            );


        if (!selectedVolunteer) {

            alert(
                "Invalid Volunteer ID. Please select an ID from the list."
            );

            return;
        }


        // Check current availability
        const availability =
            String(
                selectedVolunteer.Availability || ""
            )
                .trim()
                .toLowerCase();


        if (availability !== "available") {

            alert(
                "This volunteer is currently busy and cannot be assigned."
            );

            return;
        }


        // Assign volunteer
        const response = await fetch(
            `http://localhost:5000/api/reports/${reportId}/assign-volunteer`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    volunteerId:
                        selectedVolunteerId
                })
            }
        );


        const data =
            await response.json();


        if (!response.ok) {

            alert(
                data.message ||
                "Volunteer assignment failed."
            );

            return;
        }


        alert(
            data.message ||
            "Volunteer assigned successfully."
        );


        // Refresh reports
        await loadReports();


    } catch (error) {

        console.error(
            "Assign Volunteer Error:",
            error
        );

        alert(
            "Unable to assign volunteer. Please check the backend."
        );
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