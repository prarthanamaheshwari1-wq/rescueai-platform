console.log("Disaster Intelligence Loaded");

let isRefreshing = false;

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
// LOAD EVENTS
// ==========================================

async function loadEvents() {

    const refreshButton =
        document.querySelector(".refresh-btn");


    if (refreshButton) {

        isRefreshing = true;

        refreshButton.textContent =
            "⏳ Refreshing...";

        refreshButton.disabled = true;

    }


    try {

        // ==============================
        // LOAD DISASTER EVENTS
        // ==============================

        const response =
            await authenticatedFetch(
                `${API_BASE}/disasters`,
                {
                    cache: "no-store"
                }
            );


        if (!response.ok) {

            throw new Error(
                `Server Error: ${response.status}`
            );

        }


        const events =
            await response.json();


        // ==============================
        // EVENT STATISTICS
        // ==============================

        const totalEvents =
            events.length;


        const activeEvents =
            events.filter(
                event =>
                    String(
                        event.Status || ""
                    )
                        .trim()
                        .toLowerCase() ===
                    "active"
            ).length;


        const floodEvents =
            events.filter(
                event =>
                    String(
                        event.Disaster_Type || ""
                    )
                        .trim()
                        .toLowerCase() ===
                    "flood"
            ).length;


        const stormEvents =
            events.filter(
                event =>
                    String(
                        event.Disaster_Type || ""
                    )
                        .trim()
                        .toLowerCase() ===
                    "storm"
            ).length;


        // ==============================
        // RISK SUMMARY
        // ==============================

        const riskResponse =
            await authenticatedFetch(
                `${API_BASE}/reports/risk-summary`,
                {
                    cache: "no-store"
                }
            );


        if (!riskResponse.ok) {

            throw new Error(
                `Risk Summary Error: ${riskResponse.status}`
            );

        }


        const riskData =
            await riskResponse.json();


        const highRisk =
            riskData.HighRisk || 0;


        const mediumRisk =
            riskData.MediumRisk || 0;


        const lowRisk =
            riskData.LowRisk || 0;


        document.getElementById(
            "highRisk"
        ).textContent =
            highRisk;


        document.getElementById(
            "mediumRisk"
        ).textContent =
            mediumRisk;


        document.getElementById(
            "lowRisk"
        ).textContent =
            lowRisk;


        document.getElementById(
            "totalEvents"
        ).textContent =
            totalEvents;


        document.getElementById(
            "activeEvents"
        ).textContent =
            activeEvents;


        document.getElementById(
            "floodEvents"
        ).textContent =
            floodEvents;


        document.getElementById(
            "stormEvents"
        ).textContent =
            stormEvents;


        // ==============================
        // DISASTER EVENT CARDS
        // ==============================

        const container =
            document.getElementById(
                "eventsContainer"
            );


        container.innerHTML = "";


        events.forEach(event => {

            container.innerHTML += `
                <div class="event-card ${String(event.Disaster_Type || "").toLowerCase()}">

                    <h3>
                        ${event.Disaster_Name}
                    </h3>

                    <p>
                        <strong>Type:</strong>
                        ${event.Disaster_Type}
                    </p>

                    <p>
                        <strong>Description:</strong>
                        ${event.Description}
                    </p>

                    <p>
                        <strong>Status:</strong>

                        <span class="event-status ${String(event.Status || "").toLowerCase()}">

                            ${
                                String(
                                    event.Status || ""
                                )
                                    .toLowerCase() ===
                                "active"
                                    ? "Active"
                                    : event.Status
                            }

                        </span>
                    </p>

                    <p>
                        <strong>Start Date:</strong>

                        ${
                            event.Start_Date
                                ? new Date(
                                    event.Start_Date
                                ).toLocaleString()
                                : "N/A"
                        }

                    </p>

                </div>
            `;

        });


        console.log(
            "Disaster Events Loaded:",
            events.length
        );


        // ==============================
        // REFRESH BUTTON SUCCESS
        // ==============================

        if (refreshButton) {

            refreshButton.textContent =
                "✅ Updated";


            setTimeout(() => {

                refreshButton.textContent =
                    "🔄 Refresh Intelligence";

                refreshButton.disabled =
                    false;

                isRefreshing =
                    false;

            }, 1500);

        }


    } catch (error) {

        console.error(
            "Disaster Intelligence Error:",
            error
        );


        if (refreshButton) {

            refreshButton.textContent =
                "❌ Refresh Failed";


            setTimeout(() => {

                refreshButton.textContent =
                    "🔄 Refresh Intelligence";

                refreshButton.disabled =
                    false;

                isRefreshing =
                    false;

            }, 1500);

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

            await loadEvents();

        } catch (error) {

            console.error(
                "Authentication initialization failed:",
                error
            );

        }

    }
);