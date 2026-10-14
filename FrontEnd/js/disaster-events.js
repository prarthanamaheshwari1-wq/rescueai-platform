async function loadDisasterEvents() {

    const tableBody =
        document.getElementById("disasterTableBody");

    try {

        // ==========================================
        // CHECK ACCESS TOKEN
        // ==========================================

        // ==========================================
        // DYNAMIC API_BASE & TOKEN RESOLUTION
        // ==========================================

        const API_BASE = `${window.location.protocol}//${window.location.hostname}:5000/api`;

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
            window.location.replace("authority-login.html");
            return;
        }

        // ==========================================
        // LOAD DISASTER EVENTS
        // ==========================================

        const response = await fetch(`${API_BASE}/disasters`, {
            headers: {
                "Authorization": `Bearer ${token}`
            },
            credentials: "include"
        });

        if (response.status === 401) {
            console.error("Unauthorized request. Redirecting to login.");
            window.location.replace("authority-login.html");
            return;
        }

        if (!response.ok) {

            throw new Error(
                `HTTP error! Status: ${response.status}`
            );

        }


        const disasters =
            await response.json();


        // ==========================================
        // UPDATE SUMMARY CARD COUNTERS
        // ==========================================

        const totalCount =
            disasters.length;


        const activeCount =
            disasters.filter(
                d =>
                    (
                        d.Status ||
                        d.status ||
                        ""
                    )
                        .toLowerCase() ===
                    "active"
            ).length;


        document.getElementById(
            "totalAlerts"
        ).textContent =
            totalCount;


        document.getElementById(
            "activeAlerts"
        ).textContent =
            activeCount;


        // ==========================================
        // IF NO RECORDS IN DATABASE
        // ==========================================

        if (disasters.length === 0) {

            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="no-data">
                        <i class="fa-solid fa-circle-check"></i>
                        <p>
                            No disaster alerts found in the system.
                        </p>
                    </td>
                </tr>
            `;

            return;
        }


        // ==========================================
        // HELPER: ICONS FOR DISASTER TYPES
        // ==========================================

        const getDisasterIcon =
            (type = "") => {

                const lowerType =
                    type.toLowerCase();


                if (
                    lowerType.includes("flood") ||
                    lowerType.includes("rain")
                ) {

                    return `
                        <i class="fa-solid fa-cloud-showers-heavy"></i>
                    `;

                }


                if (
                    lowerType.includes("storm") ||
                    lowerType.includes("wind")
                ) {

                    return `
                        <i class="fa-solid fa-bolt"></i>
                    `;

                }


                if (
                    lowerType.includes("heat") ||
                    lowerType.includes("fire")
                ) {

                    return `
                        <i class="fa-solid fa-fire"></i>
                    `;

                }


                if (
                    lowerType.includes("quake")
                ) {

                    return `
                        <i class="fa-solid fa-house-crack"></i>
                    `;

                }


                return `
                    <i class="fa-solid fa-triangle-exclamation"></i>
                `;

            };


        // ==========================================
        // HELPER: FORMAT DATE STRINGS
        // ==========================================

        const formatDate =
            (dateStr) => {

                if (!dateStr) {
                    return "N/A";
                }


                const date =
                    new Date(dateStr);


                return isNaN(date.getTime())
                    ? "N/A"
                    : date.toLocaleString(
                        undefined,
                        {
                            dateStyle: "short",
                            timeStyle: "short"
                        }
                    );

            };


        // ==========================================
        // RENDER TABLE ROWS
        // ==========================================

        const rowsHtml =
            disasters
                .map(disaster => {

                    const statusStr =
                        (
                            disaster.Status ||
                            disaster.status ||
                            "Inactive"
                        ).trim();


                    const statusLower =
                        statusStr.toLowerCase();


                    let badgeClass =
                        "badge-inactive";


                    if (
                        statusLower ===
                        "active"
                    ) {

                        badgeClass =
                            "badge-active";

                    }


                    if (
                        statusLower ===
                        "resolved"
                    ) {

                        badgeClass =
                            "badge-resolved";

                    }


                    const disasterType =
                        disaster.Disaster_Type ||
                        disaster.disaster_type ||
                        "General";


                    const icon =
                        getDisasterIcon(
                            disasterType
                        );


                    return `
                        <tr>

                            <td>
                                <strong>
                                    #${
                                        disaster.Disaster_id ||
                                        disaster.Disaster_ID ||
                                        "N/A"
                                    }
                                </strong>
                            </td>

                            <td class="disaster-type">
                                ${icon}
                                ${disasterType}
                            </td>

                            <td>
                                <strong>
                                    ${
                                        disaster.Disaster_Name ||
                                        disaster.disaster_name ||
                                        "Untitled Alert"
                                    }
                                </strong>
                            </td>

                            <td>
                                ${
                                    disaster.Description ||
                                    disaster.description ||
                                    "No description provided."
                                }
                            </td>

                            <td>
                                ${
                                    formatDate(
                                        disaster.Start_Date ||
                                        disaster.start_date
                                    )
                                }
                            </td>

                            <td>
                                ${
                                    formatDate(
                                        disaster.End_Date ||
                                        disaster.end_date
                                    )
                                }
                            </td>

                            <td>
                                <span class="badge ${badgeClass}">
                                    ${statusStr}
                                </span>
                            </td>

                        </tr>
                    `;

                })
                .join("");


        tableBody.innerHTML =
            rowsHtml;


    } catch (error) {

        console.error(
            "Disaster Events Error:",
            error
        );


        document.getElementById(
            "totalAlerts"
        ).textContent = "0";


        document.getElementById(
            "activeAlerts"
        ).textContent = "0";


        tableBody.innerHTML = `
            <tr>
                <td
                    colspan="7"
                    class="no-data"
                    style="color: #ef4444;"
                >
                    <i class="fa-solid fa-triangle-exclamation"></i>

                    <p>
                        Failed to load disaster alerts.
                        Please check backend API connection.
                    </p>

                </td>
            </tr>
        `;

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

            await loadDisasterEvents();

        } catch (error) {

            console.error(
                "Authentication initialization failed:",
                error
            );

        }

    }
);