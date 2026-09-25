console.log("AI Analysis Dashboard Loaded");

async function loadAnalysis() {

    try {

        const response = await fetch(
            "http://localhost:5000/api/ai-analysis"
        );

        const analyses = await response.json();

        // Category Statistics

        const categoryCounts = {};

        analyses.forEach(item => {

            const category = item.AI_Category || "Other";

            categoryCounts[category] =
                (categoryCounts[category] || 0) + 1;

        });

        // Priority Statistics

        const priorityCounts = {
            Critical: 0,
            Moderate: 0,
            Low: 0
        };

        analyses.forEach(item => {

            const priority = item.AI_Priority;

            if (priorityCounts[priority] !== undefined) {

                priorityCounts[priority]++;

            }

        });

        const totalAnalysis = analyses.length;

        const criticalCases = analyses.filter(
            item => item.AI_Priority === "Critical"
        ).length;

        const misinformationCases = analyses.filter(
            item => Number(item.Misinformation_Score) >= 50
        ).length;

        document.getElementById("totalAnalysis").textContent =
            totalAnalysis;

        document.getElementById("criticalCases").textContent =
            criticalCases;

        document.getElementById("misinformationCases").textContent =
            misinformationCases;

        createCategoryChart(categoryCounts);
        createPriorityChart(priorityCounts);

        const container =
            document.getElementById("analysisContainer");

        container.innerHTML = "";

        analyses.forEach(item => {

            let priorityClass = "low";
            let badgeClass = "badge-low";

            if (item.AI_Priority === "Critical") {
                priorityClass = "critical";
                badgeClass = "badge-critical";
            }
            else if (item.AI_Priority === "Moderate") {
                priorityClass = "moderate";
                badgeClass = "badge-moderate";
            }

            container.innerHTML += `
                <div class="analysis-card ${priorityClass}">

                    <h2>
                        Report #${item.Report_id}
                    </h2>

                    <p>
                        <strong>Category:</strong>
                        ${item.AI_Category}
                    </p>

                    <p>
                        <strong>Severity:</strong>
                        ${item.AI_Severity}
                    </p>

                    <p>
                        <strong>Priority:</strong>
                        <span class="badge ${badgeClass}">
                            ${item.AI_Priority}
                        </span>
                    </p>

                    <p>
                        <strong>Misinformation Score:</strong>
                        ${item.Misinformation_Score}%
                    </p>

                    <p>
                        <strong>Summary:</strong>
                        ${item.AI_Summary}
                    </p>

                    <p>
                        <strong>Recommendation:</strong>
                        ${item.AI_Recommendation}
                    </p>

                    <button onclick="viewReport(${item.Report_id})">
                        View Report
                    </button>

                </div>
            `;
        });

    } catch (error) {

        console.error(error);

    }

}

loadAnalysis();


let categoryChartInstance = null;
let priorityChartInstance = null;

function createCategoryChart(categoryCounts) {

    const ctx =
        document.getElementById("categoryChart");

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

function createPriorityChart(priorityCounts) {

    const ctx =
        document.getElementById("priorityChart");

    if (priorityChartInstance) {
        priorityChartInstance.destroy();
    }

    priorityChartInstance = new Chart(ctx, {

        type: "pie",

        data: {

            labels: Object.keys(priorityCounts),

            datasets: [{

                data: Object.values(priorityCounts)

            }]
        },

        options: {

            responsive: true

        }

    });

}

function viewReport(reportId) {

    window.location.href =
        `report-details.html?id=${reportId}`;
}