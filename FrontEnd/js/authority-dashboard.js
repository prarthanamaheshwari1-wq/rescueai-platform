console.log("Authority Dashboard Loaded");

// Automatically matches whatever hostname the user uses (localhost or 127.0.0.1)
const API_BASE = `${window.location.protocol}//${window.location.hostname}:5000/api`;


// ==========================================
// AUTHENTICATED FETCH
// ==========================================

// ==========================================
// AUTHENTICATED FETCH
// ==========================================

async function authenticatedFetch(
    url,
    options = {}
) {

    // Ensure auth-guard refresh finishes before checking token
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

        console.error(
            "Access token not available."
        );

        window.location.replace(
            "authority-login.html"
        );

        throw new Error(
            "Authentication required."
        );
    }


    const headers = {

        ...(options.headers || {}),

        "Authorization":
            `Bearer ${token}`

    };


    const response = await fetch(
        url,
        {
            ...options,
            headers,
            credentials: "include"
        }
    );

    if (response.status === 401) {
        console.error("Unauthorized request. Redirecting to login.");
        window.location.replace("authority-login.html");
        throw new Error("Unauthorized");
    }

    return response;

}


// ==========================================
// LOAD REPORTS
// ==========================================

async function loadReports() {

    console.log("Starting loadReports...");

    try {

        const response = await authenticatedFetch(
            `${API_BASE}/reports`,
            {
                cache: "no-store"
            }
        );

        console.log(
            "loadReports HTTP Status:",
            response.status
        );

        if (!response.ok) {
            throw new Error(
                `Server Error Code: ${response.status}`
            );
        }

        const reports = await response.json();

        // ==========================================
        // UPDATE REPORT COUNTS
        // ==========================================

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


        // ==========================================
        // REPORT TABLE
        // ==========================================

        const tableBody =
            document.getElementById(
                "reportsTableBody"
            );

        if (!tableBody) {

            console.error(
                "reportsTableBody NOT FOUND"
            );

            return;
        }

        tableBody.innerHTML = "";


        reports.forEach(report => {

            const status =
                String(
                    report.Status || "Submitted"
                ).trim();

            const statusClass =
                status.toLowerCase();


            tableBody.innerHTML += `
                <tr>

                    <td>
                        ${report.Report_id}
                    </td>

                    <td>
                        ${report.Category || "N/A"}
                    </td>

                    <td>
                        ${report.Severity || "N/A"}
                    </td>

                    <td>
                        ${report.Location_Name || "N/A"}
                    </td>

                    <td>
                        <span class="status ${statusClass}">
                            ${status}
                        </span>
                    </td>

                    <td>

                        <select
                            id="status-${report.Report_id}"
                            ${status === "Resolved" ||
                                status === "Rejected"
                                ? "disabled"
                                : ""}
                        >

                            ${
                                status === "Submitted"
                                    ? `
                                        <option
                                            value="Submitted"
                                            selected
                                        >
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

                            ${
                                status === "Verified"
                                    ? `
                                        <option
                                            value="Verified"
                                            selected
                                        >
                                            Verified
                                        </option>

                                        <option value="Resolved">
                                            Resolved
                                        </option>
                                    `
                                    : ""
                            }

                            ${
                                status === "Resolved"
                                    ? `
                                        <option
                                            value="Resolved"
                                            selected
                                        >
                                            Resolved
                                        </option>
                                    `
                                    : ""
                            }

                            ${
                                status === "Rejected"
                                    ? `
                                        <option
                                            value="Rejected"
                                            selected
                                        >
                                            Rejected
                                        </option>
                                    `
                                    : ""
                            }

                        </select>

                    </td>


                    <td>

                        ${
                            status === "Resolved" ||
                            status === "Rejected"

                                ? `
                                    <button disabled>
                                        Closed
                                    </button>
                                `

                                : `
                                    <button
                                        onclick="updateStatus(${report.Report_id})"
                                    >
                                        Update
                                    </button>
                                `
                        }

                    </td>


                    <td>

                        ${
                            status === "Resolved" ||
                            status === "Rejected"

                                ? `
                                    <button disabled>
                                        Closed
                                    </button>
                                `

                                : `
                                    <button
                                        onclick="assignResource(${report.Report_id})"
                                    >
                                        🚒 Resource
                                    </button>
                                `
                        }

                    </td>


                    <td>

                        ${
                            status === "Resolved" ||
                            status === "Rejected"

                                ? `
                                    <button disabled>
                                        Closed
                                    </button>
                                `

                                : `
                                    <button
                                        onclick="assignVolunteer(${report.Report_id})"
                                    >
                                        👨‍🚒 Volunteer
                                    </button>
                                `
                        }

                    </td>


                    <td>

                        <button
                            onclick="viewReport(${report.Report_id})"
                        >
                            View
                        </button>

                    </td>

                </tr>
            `;
        });


        console.log(
            "Table render complete!"
        );


        await loadAlerts();


    } catch (error) {

        console.error(
            "Error in loadReports:",
            error
        );

    }

}


// ==========================================
// LOAD ALERTS
// ==========================================

async function loadAlerts() {

    console.log("Loading Alerts...");

    try {

        const response = await authenticatedFetch(
            `${API_BASE}/alerts`,
            {
                cache: "no-store"
            }
        );


        console.log(
            "Alerts API Status:",
            response.status
        );


        if (!response.ok) {

            throw new Error(
                `Alerts API Error: ${response.status}`
            );
        }


        const alerts =
            await response.json();


        console.log(
            "Alerts Received:",
            alerts
        );


        const container =
            document.getElementById(
                "alertsContainer"
            );


        if (!container) {

            console.error(
                "alertsContainer NOT FOUND"
            );

            return;
        }


        if (
            !alerts ||
            alerts.length === 0
        ) {

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
                        ⚠ ${alert.Title || "Alert"}
                    </h3>

                    <p>
                        ${alert.Description || "No description available."}
                    </p>

                    <p>
                        <strong>Location:</strong>
                        ${alert.Location_Name || "N/A"}
                    </p>

                    <p>
                        <strong>Severity:</strong>
                        ${alert.Severity || "N/A"}
                    </p>

                    <button
                        onclick="resolveAlert(${alert.Alert_id})"
                    >
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


// ==========================================
// UPDATE REPORT STATUS
// ==========================================

async function updateStatus(reportId) {

    const statusElement =
        document.getElementById(
            `status-${reportId}`
        );


    if (!statusElement) {

        alert(
            "Status selector not found."
        );

        return;
    }


    const newStatus =
        statusElement.value;


    try {

        const response =
            await authenticatedFetch(
                `${API_BASE}/reports/${reportId}/status`,
                {
                    method: "PUT",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        status: newStatus
                    })
                }
            );


        const data =
            await response.json();


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


// ==========================================
// VIEW REPORT
// ==========================================

function viewReport(reportId) {

    window.location.href =
        `report-details.html?id=${reportId}`;

}


// ==========================================
// ASSIGN RESOURCE
// ==========================================

async function assignResource(reportId) {

    try {

        // ==========================================
        // GET AI RESOURCE RECOMMENDATIONS
        // ==========================================

        const recommendationResponse =
            await authenticatedFetch(
                `${API_BASE}/resources/recommendations/${reportId}`,
                {
                    cache: "no-store"
                }
            );


        if (recommendationResponse.ok) {

            const recommendationData =
                await recommendationResponse.json();


            const recommendations =
                recommendationData.recommendations || [];


            const recommendedTypes =
                recommendations
                    .map(
                        item =>
                            item.resourceType
                    )
                    .filter(Boolean)
                    .join(", ");


            if (recommendedTypes) {

                alert(
                    "AI Resource Recommendation:\n\n" +
                    recommendedTypes +
                    "\n\nYou can now choose a resource from the available list."
                );

            }

        }


        // ==========================================
        // GET AVAILABLE RESOURCES
        // ==========================================

        const resourcesResponse =
            await authenticatedFetch(
                `${API_BASE}/resources`,
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


        const availableResources =
            resources.filter(
                resource =>

                    Number(
                        resource.Quantity || 0
                    ) > 0 &&

                    String(
                        resource.Status || ""
                    )
                        .trim()
                        .toLowerCase() ===
                    "available"
            );


        if (
            availableResources.length === 0
        ) {

            alert(
                "No resources are currently available."
            );

            return;

        }


        // ==========================================
        // RESOURCE LIST
        // ==========================================

        const resourceList =
            availableResources
                .map(
                    resource =>
                        `${resource.Resource_id} = ${resource.Resource_Name || "Resource"} (${resource.Resource_Type || "N/A"}, Qty: ${resource.Quantity})`
                )
                .join("\n");


        const resourceId =
            prompt(
                "Enter Resource ID:\n\n" +
                resourceList
            );


        if (!resourceId) {
            return;
        }


        const selectedResourceId =
            parseInt(
                resourceId,
                10
            );


        if (
            isNaN(selectedResourceId)
        ) {

            alert(
                "Please enter a valid Resource ID."
            );

            return;
        }


        // ==========================================
        // FIND SELECTED RESOURCE
        // ==========================================

        const selectedResource =
            availableResources.find(
                resource =>
                    Number(
                        resource.Resource_id
                    ) ===
                    selectedResourceId
            );


        if (!selectedResource) {

            alert(
                "Invalid Resource ID. Please select an ID from the available list."
            );

            return;
        }


        // ==========================================
        // ASSIGN RESOURCE
        // ==========================================

        const response =
            await authenticatedFetch(
                `${API_BASE}/reports/${reportId}/assign-resource`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        reportId:
                            reportId,

                        resourceId:
                            selectedResourceId
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


// ==========================================
// ASSIGN VOLUNTEER
// ==========================================

async function assignVolunteer(reportId) {

    try {

        // ==========================================
        // GET VOLUNTEERS
        // ==========================================

        const volunteersResponse =
            await authenticatedFetch(
                `${API_BASE}/volunteers`,
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


        if (
            !volunteers ||
            volunteers.length === 0
        ) {

            alert(
                "No volunteers are currently registered."
            );

            return;
        }


        // ==========================================
        // VOLUNTEER LIST
        // ==========================================

        const volunteerList =
            volunteers
                .map(
                    volunteer => {

                        const availability =
                            String(
                                volunteer.Availability ||
                                "Unknown"
                            )
                                .trim()
                                .toLowerCase();


                        const status =
                            availability ===
                            "available"

                                ? "Available"

                                : "Busy";


                        return (
                            `${volunteer.Volunteer_id} = ` +
                            `${volunteer.Full_Name || volunteer.fullName || "Volunteer"} ` +
                            `(${volunteer.Skills || "No skill listed"}) - ` +
                            `${status}`
                        );

                    }
                )
                .join("\n");


        const volunteerId =
            prompt(
                "Enter Volunteer ID:\n\n" +
                volunteerList +
                "\n\nAvailable volunteers can be assigned."
            );


        if (!volunteerId) {
            return;
        }


        const selectedVolunteerId =
            parseInt(
                volunteerId,
                10
            );


        if (
            isNaN(selectedVolunteerId)
        ) {

            alert(
                "Please enter a valid Volunteer ID."
            );

            return;
        }


        // ==========================================
        // FIND SELECTED VOLUNTEER
        // ==========================================

        const selectedVolunteer =
            volunteers.find(
                volunteer =>
                    Number(
                        volunteer.Volunteer_id
                    ) ===
                    selectedVolunteerId
            );


        if (!selectedVolunteer) {

            alert(
                "Invalid Volunteer ID. Please select an ID from the list."
            );

            return;
        }


        // ==========================================
        // CHECK AVAILABILITY
        // ==========================================

        const availability =
            String(
                selectedVolunteer.Availability ||
                ""
            )
                .trim()
                .toLowerCase();


        if (
            availability !== "available"
        ) {

            alert(
                "This volunteer is currently busy and cannot be assigned."
            );

            return;
        }


        // ==========================================
        // ASSIGN VOLUNTEER
        // ==========================================

        const response =
            await authenticatedFetch(
                `${API_BASE}/reports/${reportId}/assign-volunteer`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
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


// ==========================================
// RESOLVE ALERT
// ==========================================

async function resolveAlert(alertId) {

    try {

        const response =
            await authenticatedFetch(
                `${API_BASE}/alerts/${alertId}/resolve`,
                {
                    method: "PUT"
                }
            );


        const data =
            await response.json();


        if (!response.ok) {

            alert(
                data.message ||
                "Unable to resolve alert."
            );

            return;
        }


        alert(
            data.message ||
            "Alert resolved successfully."
        );


        await loadAlerts();


    } catch (error) {

        console.error(
            "Resolve Alert Error:",
            error
        );


        alert(
            "Unable to resolve alert. Please check the backend."
        );

    }

}


// ==========================================
// PAGE LOAD
// ==========================================

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        try {

            if (window.RescueAIAuthReady) {
                await window.RescueAIAuthReady;
            }

            await loadReports();

        } catch (error) {

            console.error(
                "Authentication initialization failed:",
                error
            );

        }

    }
);