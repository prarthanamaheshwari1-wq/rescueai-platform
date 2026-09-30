console.log("Disaster Intelligence Loaded");

let isRefreshing = false;

async function loadEvents() {

    const refreshButton =
        document.querySelector(".refresh-btn");

    if (refreshButton) {
        isRefreshing = true;
        refreshButton.textContent = "⏳ Refreshing...";
        refreshButton.disabled = true;
    }

    try {

        const response = await fetch(
            "http://localhost:5000/api/disasters",
            {
                cache: "no-store"
            }
        );

        if (!response.ok) {
            throw new Error(
                `Server Error: ${response.status}`
            );
        }

        const events = await response.json();

        // ==============================
        // EVENT STATISTICS
        // ==============================

        const totalEvents = events.length;

        const activeEvents = events.filter(
            event =>
                String(event.Status || "")
                    .trim()
                    .toLowerCase() === "active"
        ).length;

        const floodEvents = events.filter(
            event =>
                String(event.Disaster_Type || "")
                    .trim()
                    .toLowerCase() === "flood"
        ).length;

        const stormEvents = events.filter(
            event =>
                String(event.Disaster_Type || "")
                    .trim()
                    .toLowerCase() === "storm"
        ).length;

        const riskResponse = await fetch(
            "http://localhost:5000/api/reports/risk-summary",
            {
                cache: "no-store"
            }
        );

        if (!riskResponse.ok) {
            throw new Error(
                `Risk Summary Error: ${riskResponse.status}`
            );
        }

        const riskData = await riskResponse.json();

        const highRisk = riskData.HighRisk || 0;
        const mediumRisk = riskData.MediumRisk || 0;
        const lowRisk = riskData.LowRisk || 0;

        document.getElementById("highRisk")
            .textContent = highRisk;

        document.getElementById("mediumRisk")
            .textContent = mediumRisk;

        document.getElementById("lowRisk")
            .textContent = lowRisk;

        document.getElementById("totalEvents")
            .textContent = totalEvents;

        document.getElementById("activeEvents")
            .textContent = activeEvents;

        document.getElementById("floodEvents")
            .textContent = floodEvents;

        document.getElementById("stormEvents")
            .textContent = stormEvents;


        // ==============================
        // DISASTER EVENT CARDS
        // ==============================

        const container =
            document.getElementById("eventsContainer");

        container.innerHTML = "";

        events.forEach(event => {

            container.innerHTML += `
                <div class="event-card ${String(event.Disaster_Type || "").toLowerCase()}">

                    <h3>${event.Disaster_Name}</h3>

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
                            ${String(event.Status || "").toLowerCase() === "active"
                    ? "Active"
                    : event.Status}
                        </span>
                    </p>

                    <p>
                        <strong>Start Date:</strong>
                        ${event.Start_Date
                    ? new Date(event.Start_Date).toLocaleString()
                    : "N/A"}
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

            refreshButton.textContent = "✅ Updated";

            setTimeout(() => {

                refreshButton.textContent =
                    "🔄 Refresh Intelligence";

                refreshButton.disabled = false;

                isRefreshing = false;

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

                refreshButton.disabled = false;

                isRefreshing = false;

            }, 1500);
        }

    }

}

loadEvents();