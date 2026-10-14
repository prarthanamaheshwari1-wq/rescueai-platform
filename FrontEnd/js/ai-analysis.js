console.log("AI Analysis Dashboard Loaded");

// Automatically matches whatever hostname the user uses (localhost or 127.0.0.1)
const API_BASE = `${window.location.protocol}//${window.location.hostname}:5000/api`;

let categoryChartInstance = null;
let priorityChartInstance = null;
let allAnalyses = [];


// ==========================================
// AUTHENTICATED FETCH
// ==========================================

// ==========================================
// AUTHENTICATED FETCH
// ==========================================

async function authenticatedFetch(url, options = {}) {

    // Helper function to fetch memory token or wait for auth-guard resolution
    let token = window.RescueAIAccessToken;

    if (!token && typeof window.ensureAuthenticated === "function") {
        try {
            token = await window.ensureAuthenticated();
        } catch (err) {
            console.error("Authentication check failed:", err);
        }
    }

    if (!token) {
        console.error("Access token not available.");
        window.location.replace("authority-login.html");
        throw new Error("Authentication required.");
    }

    const headers = {
        ...(options.headers || {}),
        "Authorization": `Bearer ${token}`
    };

    return fetch(url, {
        ...options,
        headers,
        credentials: "include"
    });

}


// ==========================================
// LOAD AI ANALYSIS
// ==========================================

async function loadAnalysis() {

    try {

        const response = await authenticatedFetch(
            `${API_BASE}/ai-analysis`
        );

        const analyses = await response.json();

        allAnalyses = analyses;


        // ==============================
        // Category Statistics
        // ==============================

        const categoryCounts = {};

        analyses.forEach(item => {

            const category =
                item.AI_Category || "Other";

            categoryCounts[category] =
                (categoryCounts[category] || 0) + 1;

        });


        // ==============================
        // Priority Statistics
        // ==============================

        const priorityCounts = {
            Critical: 0,
            High: 0,
            Moderate: 0,
            Low: 0
        };


        analyses.forEach(item => {

            const priority =
                String(item.AI_Priority || "")
                    .trim();

            if (priorityCounts[priority] !== undefined) {

                priorityCounts[priority]++;

            }

        });


        // ==============================
        // Dashboard Statistics
        // ==============================

        const totalAnalysis =
            analyses.length;


        const criticalCases =
            analyses.filter(
                item =>
                    String(item.AI_Priority || "")
                        .trim()
                        .toLowerCase() === "critical"
            ).length;


        const misinformationCases =
            analyses.filter(
                item =>
                    Number(item.Misinformation_Score) >= 50
            ).length;


        document.getElementById(
            "totalAnalysis"
        ).textContent = totalAnalysis;


        document.getElementById(
            "criticalCases"
        ).textContent = criticalCases;


        document.getElementById(
            "misinformationCases"
        ).textContent = misinformationCases;


        // ==============================
        // Charts
        // ==============================

        createCategoryChart(categoryCounts);

        createPriorityChart(priorityCounts);


        // ==============================
        // Search
        // ==============================

        const searchInput =
            document.getElementById("searchInput");


        searchInput.addEventListener(
            "input",
            function () {

                const searchText =
                    this.value.trim().toLowerCase();


                const filteredAnalyses =
                    allAnalyses.filter(item => {

                        return (

                            String(item.Report_id || "")
                                .toLowerCase()
                                .includes(searchText)

                            ||

                            String(item.AI_Category || "")
                                .toLowerCase()
                                .includes(searchText)

                            ||

                            String(item.AI_Priority || "")
                                .toLowerCase()
                                .includes(searchText)

                            ||

                            String(item.AI_Severity || "")
                                .toLowerCase()
                                .includes(searchText)

                            ||

                            String(item.AI_Summary || "")
                                .toLowerCase()
                                .includes(searchText)

                            ||

                            String(item.AI_Recommendation || "")
                                .toLowerCase()
                                .includes(searchText)

                            ||

                            String(item.AI_Visual_Findings || "")
                                .toLowerCase()
                                .includes(searchText)

                        );

                    });


                renderAnalysisCards(filteredAnalyses);

            }
        );


        // Initial cards
        renderAnalysisCards(analyses);


    } catch (error) {

        console.error(
            "AI Analysis Load Error:",
            error
        );

    }

}


// ==========================================
// Render Analysis Cards
// ==========================================

function renderAnalysisCards(analyses) {

    const container =
        document.getElementById(
            "analysisContainer"
        );


    container.innerHTML = "";


    if (analyses.length === 0) {

        container.innerHTML = `
            <p style="
                text-align:center;
                color:#6b7280;
                font-size:18px;
                padding:30px;
            ">
                No analysis found.
            </p>
        `;

        return;

    }


    const cardsHTML =
        analyses.map(item => {

            const priority =
                item.AI_Priority || "Low";


            let priorityClass = "low";
            let badgeClass = "badge-low";


            if (priority === "Critical") {

                priorityClass = "critical";
                badgeClass = "badge-critical";

            }

            else if (priority === "High") {

                priorityClass = "high";
                badgeClass = "badge-high";

            }

            else if (priority === "Moderate") {

                priorityClass = "moderate";
                badgeClass = "badge-moderate";

            }


            return `
                <div class="analysis-card ${priorityClass}">

                    <h2>
                        Report #${item.Report_id}
                    </h2>

                    <p>
                        <strong>Category:</strong>
                        ${item.AI_Category || "N/A"}
                    </p>

                    <p>
                        <strong>Severity:</strong>
                        ${item.AI_Severity || "N/A"}
                    </p>

                    <p>
                        <strong>Priority:</strong>
                        <span class="badge ${badgeClass}">
                            ${priority}
                        </span>
                    </p>

                    <p>
                        <strong>Misinformation Score:</strong>
                        ${item.Misinformation_Score ?? 0}%
                    </p>

                    <p>
                        <strong>Summary:</strong>
                        ${item.AI_Summary || "No summary provided."}
                    </p>

                    <p>
                        <strong>Visual Findings:</strong><br>
                        ${item.AI_Visual_Findings || "No image evidence available."}
                    </p>

                    <p>
                        <strong>Recommendation:</strong>
                        ${item.AI_Recommendation || "No recommendation available."}
                    </p>

                    <button
                        onclick="viewReport(${item.Report_id})">
                        View Report
                    </button>

                </div>
            `;

        }).join("");


    container.innerHTML = cardsHTML;

}


// ==========================================
// Category Chart
// ==========================================

function createCategoryChart(categoryCounts) {

    const ctx =
        document.getElementById(
            "categoryChart"
        );


    if (categoryChartInstance) {

        categoryChartInstance.destroy();

    }


    categoryChartInstance =
        new Chart(ctx, {

            type: "bar",

            data: {

                labels:
                    Object.keys(categoryCounts),

                datasets: [{

                    label: "Incidents",

                    data:
                        Object.values(categoryCounts)

                }]

            },

            options: {

                responsive: true,

                plugins: {

                    legend: {

                        display: false

                    }

                }

            }

        });

}


// ==========================================
// Priority Pie Chart
// ==========================================

function createPriorityChart(priorityCounts) {

    const ctx =
        document.getElementById(
            "priorityChart"
        );


    if (priorityChartInstance) {

        priorityChartInstance.destroy();

    }


    priorityChartInstance =
        new Chart(ctx, {

            type: "pie",

            data: {

                labels: [
                    "Critical",
                    "High",
                    "Moderate",
                    "Low"
                ],

                datasets: [{

                    data: [
                        priorityCounts.Critical,
                        priorityCounts.High,
                        priorityCounts.Moderate,
                        priorityCounts.Low
                    ]

                }]

            },

            options: {

                responsive: true,

                maintainAspectRatio: false,

                plugins: {

                    legend: {

                        position: "bottom"

                    }

                }

            }

        });

}


// ==========================================
// View Report
// ==========================================

function viewReport(reportId) {

    window.location.href =
        `report-details.html?id=${reportId}`;

}


 // ==========================================
// LOAD DASHBOARD AFTER AUTHENTICATION
// ==========================================

(async function () {
    try {
        if (typeof window.ensureAuthenticated === "function") {
            await window.ensureAuthenticated();
        }

        if (!window.RescueAIAccessToken) {
            window.location.replace("authority-login.html");
            return;
        }

        await loadAnalysis();

    } catch (error) {
        console.error("Dashboard authentication failed:", error);
        window.location.replace("authority-login.html");
    }
})();