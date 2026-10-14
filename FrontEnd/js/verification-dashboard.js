console.log("Verification Dashboard Loaded");


// ==========================================
// API BASE
// ==========================================

// ==========================================
// API BASE
// ==========================================

const API_BASE =
    `${window.location.protocol}//${window.location.hostname}:5000/api`;


// ==========================================
// AUTHENTICATED FETCH
// ==========================================

async function authenticatedFetch(
    url,
    options = {}
) {

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
// LOAD PENDING REPORTS
// ==========================================

async function loadPendingReports() {

    try {

        const response =
            await authenticatedFetch(
                `${API_BASE}/reports/pending`
            );


        if (!response.ok) {

            throw new Error(
                `Failed to fetch pending reports. Status: ${response.status}`
            );

        }


        const reports =
            await response.json();


        const container =
            document.getElementById(
                "reportsContainer"
            );


        container.innerHTML = "";


        reports.forEach(
            report => {

                container.innerHTML += `

                    <div class="report-card">

                        <h2>
                            Report #${report.Report_id}
                        </h2>


                        <p>

                            <strong>
                                Title:
                            </strong>

                            ${report.Title}

                        </p>


                        <p>

                            <strong>
                                Category:
                            </strong>

                            ${report.Category}

                        </p>


                        <p>

                            <strong>
                                Severity:
                            </strong>

                            ${report.Severity}

                        </p>


                        <p>

                            <strong>
                                Location:
                            </strong>

                            ${report.Location_Name}

                        </p>


                        <p>

                            <strong>
                                Status:
                            </strong>

                            ${report.Status}

                        </p>


                        <p>

                            <strong>
                                AI Priority:
                            </strong>

                            ${report.AI_Priority}

                        </p>


                        <p>

                            <strong>
                                Misinformation Score:
                            </strong>

                            ${report.Misinformation_Score}%

                        </p>


                        <p>

                            <strong>
                                AI Summary:
                            </strong>

                            ${report.AI_Summary}

                        </p>


                        <p>

                            <strong>
                                AI Recommendation:
                            </strong>

                            ${report.AI_Recommendation}

                        </p>


                        <div class="resource-section">

                            <select
                                id="resource-${report.Report_id}"
                                class="resource-dropdown"
                            >

                                <option value="1">
                                    Ambulance
                                </option>

                                <option value="2">
                                    Medical Kit
                                </option>

                                <option value="3">
                                    Relief Truck
                                </option>

                                <option value="4">
                                    Fire Brigade
                                </option>

                            </select>


                            <button
                                class="assign-btn"
                                onclick="assignResource(
                                    ${report.Report_id}
                                )"
                            >
                                Assign Resource
                            </button>

                        </div>


                        <div class="resource-section">

                            <select
                                id="volunteer-${report.Report_id}"
                                class="resource-dropdown"
                            >

                                <option value="1">
                                    Volunteer 1
                                </option>

                                <option value="2">
                                    Volunteer 2
                                </option>

                                <option value="3">
                                    Volunteer 3
                                </option>

                            </select>


                            <button
                                class="assign-btn"
                                onclick="assignVolunteer(
                                    ${report.Report_id}
                                )"
                            >
                                Assign Volunteer
                            </button>

                        </div>


                        ${
                            report.Misinformation_Score >= 50

                                ? `

                                    <div
                                        style="
                                            background:#fee2e2;
                                            color:#b91c1c;
                                            padding:10px;
                                            border-radius:6px;
                                            margin-top:10px;
                                            font-weight:bold;
                                        "
                                    >
                                        ⚠ Potential Misinformation Detected
                                    </div>

                                `

                                : ""
                        }


                        <div class="button-group">


                            <button
                                class="verify-btn"
                                onclick="verifyReport(
                                    ${report.Report_id}
                                )"
                            >
                                Verify
                            </button>


                            <button
                                class="reject-btn"
                                onclick="rejectReport(
                                    ${report.Report_id}
                                )"
                            >
                                Reject
                            </button>


                            <a
                                class="details-btn"
                                href="report-details.html?id=${report.Report_id}"
                            >
                                View Details
                            </a>


                        </div>

                    </div>

                `;

            }
        );


    } catch (error) {

        console.error(
            "Load Pending Reports Error:",
            error
        );

    }

}


// ==========================================
// VERIFY REPORT
// ==========================================

async function verifyReport(
    reportId
) {

    try {

        const response =
            await authenticatedFetch(

                `${API_BASE}/reports/${reportId}/verify`,

                {
                    method: "PUT"
                }

            );


        const data =
            await response
                .json()
                .catch(
                    () => ({})
                );


        if (!response.ok) {

            alert(
                data.message ||
                "Failed to verify report."
            );

            return;

        }


        alert(
            data.message ||
            "Report Verified"
        );


        await loadPendingReports();


    } catch (error) {

        console.error(
            "Verify Report Error:",
            error
        );

    }

}


// ==========================================
// REJECT REPORT
// ==========================================

async function rejectReport(
    reportId
) {

    try {

        const response =
            await authenticatedFetch(

                `${API_BASE}/reports/${reportId}/reject`,

                {
                    method: "PUT"
                }

            );


        const data =
            await response
                .json()
                .catch(
                    () => ({})
                );


        if (!response.ok) {

            alert(
                data.message ||
                "Failed to reject report."
            );

            return;

        }


        alert(
            data.message ||
            "Report Rejected"
        );


        await loadPendingReports();


    } catch (error) {

        console.error(
            "Reject Report Error:",
            error
        );

    }

}


// ==========================================
// ASSIGN RESOURCE
// ==========================================

async function assignResource(
    reportId
) {

    try {

        const resourceId =
            document
                .getElementById(
                    `resource-${reportId}`
                )
                .value;


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

                        resourceId:
                            resourceId

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
            data.message
        );


    } catch (error) {

        console.error(
            "Assign Resource Error:",
            error
        );


        alert(
            "Assignment Failed"
        );

    }

}


// ==========================================
// ASSIGN VOLUNTEER
// ==========================================

async function assignVolunteer(
    reportId
) {

    try {

        const volunteerId =
            document
                .getElementById(
                    `volunteer-${reportId}`
                )
                .value;


        console.log(
            "Volunteer ID =",
            volunteerId
        );


        console.log(
            "Report ID =",
            reportId
        );


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
                            volunteerId

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
            data.message
        );


    } catch (error) {

        console.error(
            "Assign Volunteer Error:",
            error
        );


        alert(
            "Volunteer Assignment Failed"
        );

    }

}


// ==========================================
// INITIAL LOAD
// ==========================================

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        try {

            await window.RescueAIAuthReady;

            await loadPendingReports();

        } catch (error) {

            console.error(
                "Authentication initialization failed:",
                error
            );

        }

    }
);