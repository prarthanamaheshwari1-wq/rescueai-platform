console.log("AI Analysis Dashboard Loaded");

// Automatically matches localhost or 127.0.0.1
const API_BASE =
    `${window.location.protocol}//${window.location.hostname}:5000/api`;

let categoryChartInstance = null;
let priorityChartInstance = null;
let allAnalyses = [];


// ==========================================
// AUTHENTICATED FETCH
// ==========================================

async function authenticatedFetch(url, options = {}) {
    let token = window.RescueAIAccessToken;

    if (
        !token &&
        typeof window.ensureAuthenticated === "function"
    ) {
        try {
            token = await window.ensureAuthenticated();
        } catch (err) {
            console.error("Authentication check failed:", err);
        }
    }

    if (!token) {
        window.location.replace("authority-login.html");
        throw new Error("Authentication required.");
    }

    const headers = {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`
    };

    const response = await fetch(url, {
        ...options,
        headers,
        credentials: "include"
    });

    if (response.status === 401) {
        window.location.replace("authority-login.html");
        throw new Error("Unauthorized");
    }

    return response;
}


// ==========================================
// LOAD AI ANALYSIS
// ==========================================

async function loadAnalysis() {
    try {
        const response = await authenticatedFetch(
            `${API_BASE}/ai-analysis`
        );

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }

        const result = await response.json();

        // Support APIs returning either an array or an object
        // containing an analyses array.
        const analyses = Array.isArray(result)
            ? result
            : Array.isArray(result.analyses)
                ? result.analyses
                : [];

        allAnalyses = analyses;

        // ==============================
        // Category Statistics
        // ==============================

        const categoryCounts = {};

        analyses.forEach(item => {
            const category = item.AI_Category || "Other";

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
            const priority = String(item.AI_Priority || "").trim();

            if (priorityCounts[priority] !== undefined) {
                priorityCounts[priority]++;
            }
        });

        // ==============================
        // Dashboard Statistics
        // ==============================

        const totalAnalysis = analyses.length;

        const criticalCases = analyses.filter(
            item =>
                String(item.AI_Priority || "")
                    .trim()
                    .toLowerCase() === "critical"
        ).length;

        const misinformationCases = analyses.filter(
            item => Number(item.Misinformation_Score) >= 50
        ).length;

        const totalElement = document.getElementById("totalAnalysis");
        const criticalElement = document.getElementById("criticalCases");
        const misinformationElement =
            document.getElementById("misinformationCases");

        if (totalElement) {
            totalElement.textContent = totalAnalysis;
        }

        if (criticalElement) {
            criticalElement.textContent = criticalCases;
        }

        if (misinformationElement) {
            misinformationElement.textContent = misinformationCases;
        }

        // ==============================
        // Charts
        // ==============================

        createCategoryChart(categoryCounts);
        createPriorityChart(priorityCounts);

                // ==============================
        // Search
        // ==============================

        const searchInput = document.getElementById("searchInput");

        if (searchInput && !searchInput.dataset.listenerAttached) {
            searchInput.dataset.listenerAttached = "true";

            searchInput.addEventListener("input", function () {
                const searchText = this.value.trim().toLowerCase();

                // Empty search: show everything
                if (searchText === "") {
                    renderAnalysisCards(allAnalyses);
                    return;
                }

                const filteredAnalyses = allAnalyses.filter(item => {
                    const reportId = String(
                        item.Report_id ??
                        item.Report_ID ??
                        item.report_id ??
                        item.id ??
                        ""
                    ).toLowerCase();

                    // Digits only: search the Report ID (works for 1, 2, 3+ digits)
                    if (/^\d+$/.test(searchText)) {
                        return reportId === searchText;
                    }

                    // Text: search all text fields
                    return [
                        reportId,
                        item.AI_Category,
                        item.AI_Priority,
                        item.AI_Severity,
                        item.AI_Summary,
                        item.AI_Recommendation,
                        item.AI_Visual_Findings
                    ].some(field =>
                        String(field || "").toLowerCase().includes(searchText)
                    );
                });

                renderAnalysisCards(filteredAnalyses);
            });
        }

        // Initial cards
        renderAnalysisCards(analyses);

    } catch (error) {
        console.error("AI Analysis Load Error:", error);

        const container = document.getElementById("analysisContainer");

        if (container) {
            container.innerHTML = `
                <p style="text-align:center; color:#b91c1c; padding:20px;">
                    Failed to load AI analyses. Please refresh the page.
                </p>
            `;
        }
    }
}


// ==========================================
// GET IMAGE AUTHENTICITY INFORMATION
// ==========================================

function getImageAuthenticity(item) {
    // Support nested and flattened API response structures.
    const authenticity =
        item.Image_Authenticity ||
        item.AI_Analysis?.Image_Authenticity ||
        item.AI_Analysis?.image_authenticity ||
        item.image_authenticity ||
        {};

    const prediction =
        authenticity.Prediction ||
        authenticity.prediction ||
        item.Image_Authenticity_Prediction ||
        item.Image_Prediction ||
        item.Prediction ||
        item.prediction ||
        "UNKNOWN";

    const status =
        authenticity.Status ||
        authenticity.status ||
        item.Image_Authenticity_Status ||
        "unknown";

    const message =
        authenticity.Message ||
        authenticity.message ||
        item.Image_Authenticity_Reason ||
        item.Image_Authenticity_Message ||
        item.Message ||
        item.message ||
        "";

    const reviewValue =
        authenticity.ManualReviewRequired ??
        authenticity.manualReviewRequired ??
        item.Image_Authenticity_Manual_Review ??
        item.Image_Authenticity_ManualReviewRequired ??
        false;

    const manualReviewRequired =
        reviewValue === true ||
        reviewValue === 1 ||
        String(reviewValue).toLowerCase() === "true";

    return {
        prediction: String(prediction).trim().toUpperCase(),
        status: String(status).trim().toLowerCase(),
        message,
        manualReviewRequired
    };
}


// ==========================================
// RENDER ANALYSIS CARDS
// ==========================================

function renderAnalysisCards(analyses) {
    const container = document.getElementById("analysisContainer");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    if (!analyses.length) {
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

    const cardsHTML = analyses.map(item => {
        const priority = item.AI_Priority || "Low";

        let priorityClass = "low";
        let badgeClass = "badge-low";

        if (priority === "Critical") {
            priorityClass = "critical";
            badgeClass = "badge-critical";
        } else if (priority === "High") {
            priorityClass = "high";
            badgeClass = "badge-high";
        } else if (priority === "Moderate") {
            priorityClass = "moderate";
            badgeClass = "badge-moderate";
        }

        // ==============================
        // IMAGE AUTHENTICITY BADGE
        // ==============================

        const authenticity = getImageAuthenticity(item);

        const prediction = authenticity.prediction;
        const status = authenticity.status;
        const message = authenticity.message;
        const manualReviewRequired =
            authenticity.manualReviewRequired;

        let authBadgeStyle = "";
        let authBadgeTitle = "";


        if (prediction === "REAL") {
            authBadgeStyle =
                "background-color:#d4edda;color:#155724;border:1px solid #c3e6cb;";

            authBadgeTitle =
                "✅ No Strong AI-Generation Indicators Detected";

        } else if (prediction === "FAKE") {
            authBadgeStyle =
                "background-color:#f8d7da;color:#721c24;border:1px solid #f5c6cb;";

            authBadgeTitle =
                "⚠️ Potential AI-Generated Image Detected";

        } else if (manualReviewRequired) {
            authBadgeStyle =
                "background-color:#fff3cd;color:#856404;border:1px solid #ffeeba;";

            authBadgeTitle =
                "⚠️ Authenticity Inconclusive — Manual Review Required";

        } else {
            authBadgeStyle =
                "background-color:#fff3cd;color:#856404;border:1px solid #ffeeba;";

            authBadgeTitle =
                "⚠️ Authenticity Inconclusive";
        }


        const authenticityBadge = `
            <div style="
                ${authBadgeStyle}
                padding:10px 12px;
                border-radius:6px;
                margin:10px 0;
                font-size:0.9em;
            ">
                <strong style="display:block;margin-bottom:5px;">
                    ${authBadgeTitle}
                </strong>

                ${message
                ? `<span style="font-size:0.85em;line-height:1.5;display:block;">
                               ${message}
                           </span>`
                : ""
            }

                ${prediction !== "UNKNOWN"
                ? `<p style="margin:6px 0 0;">
                               <strong>Prediction:</strong> ${prediction}
                           </p>`
                : ""
            }

                ${status !== "unknown"
                ? `<p style="margin:4px 0 0;">
                               <strong>Assessment status:</strong> ${status}
                           </p>`
                : ""
            }

                <p style="margin:8px 0 0;font-size:0.85em;">
                    This is a preliminary AI assessment, not proof of image authenticity.
                </p>
            </div>
        `;

        return `
            <div class="analysis-card ${priorityClass}">

                <h2>
                    Report #${item.Report_id}
                </h2>

                ${authenticityBadge}

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

                <p style="white-space:pre-line;">
                    <strong>Visual Findings:</strong><br>
                    ${item.AI_Visual_Findings || "No image evidence available."}
                </p>

                <p style="white-space:pre-line;">
                    <strong>Recommendation:</strong>
                    ${item.AI_Recommendation || "No recommendation available."}
                </p>

                <button onclick="viewReport(${Number(item.Report_id)})">
                    View Report
                </button>

            </div>
        `;
    }).join("");

    container.innerHTML = cardsHTML;
}


// ==========================================
// CATEGORY CHART
// ==========================================

function createCategoryChart(categoryCounts) {
    const ctx = document.getElementById("categoryChart");

    if (!ctx || typeof Chart === "undefined") {
        return;
    }

    if (categoryChartInstance) {
        categoryChartInstance.destroy();
    }

    categoryChartInstance = new Chart(ctx, {
        type: "bar",

        data: {
            labels: Object.keys(categoryCounts),

            datasets: [{
                label: "Incidents",
                data: Object.values(categoryCounts)
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
// PRIORITY PIE CHART
// ==========================================

function createPriorityChart(priorityCounts) {
    const ctx = document.getElementById("priorityChart");

    if (!ctx || typeof Chart === "undefined") {
        return;
    }

    if (priorityChartInstance) {
        priorityChartInstance.destroy();
    }

    priorityChartInstance = new Chart(ctx, {
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
// VIEW REPORT
// ==========================================

function viewReport(reportId) {
    window.location.href =
        `report-details.html?id=${encodeURIComponent(reportId)}`;
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
