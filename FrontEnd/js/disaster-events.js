async function loadDisasterEvents() {

    const eventsContainer =
        document.getElementById("disasterEventsContainer");


    if (!eventsContainer) {
        console.error("Missing disasterEventsContainer in HTML.");
        return;
    }

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


        document.getElementById("totalEvents").textContent =
            totalCount;

        document.getElementById("activeEvents").textContent =
            activeCount;


        // ==========================================
        // IF NO RECORDS IN DATABASE
        // ==========================================

        if (disasters.length === 0) {
            eventsContainer.innerHTML = `
        <p class="no-data">
            No disaster events found.
        </p>
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

        eventsContainer.innerHTML = disasters.map(disaster => {
            const type =
                disaster.Disaster_Type ||
                disaster.disaster_type ||
                "General";

            const name =
                disaster.Disaster_Name ||
                disaster.disaster_name ||
                "Untitled Alert";

            const description =
                disaster.Description ||
                disaster.description ||
                "No description provided.";

            const status =
                disaster.Status ||
                disaster.status ||
                "Unknown";

            const startDate = formatDate(
                disaster.Start_Date ||
                disaster.start_date
            );

            const safeText = value =>
                String(value).replace(/[&<>"']/g, char => ({
                    "&": "&amp;",
                    "<": "&lt;",
                    ">": "&gt;",
                    '"': "&quot;",
                    "'": "&#39;"
                })[char]);

            return `
        <article class="disaster-event-card">
            <h3>${safeText(name)}</h3>
            <p><strong>Type:</strong> ${safeText(type)}</p>
            <p><strong>Description:</strong> ${safeText(description)}</p>
            <p><strong>Status:</strong> ${safeText(status)}</p>
            <p><strong>Start Date:</strong> ${safeText(startDate)}</p>
        </article>
    `;
        }).join("");


    } catch (error) {

        console.error(
            "Disaster Events Error:",
            error
        );


        document.getElementById("totalEvents").textContent = "0";
        document.getElementById("activeEvents").textContent = "0";

        if (eventsContainer) {
            eventsContainer.innerHTML = `
        <p class="no-data">
            Failed to load disaster events.
            Please check the backend API connection.
        </p>
    `;
        }

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