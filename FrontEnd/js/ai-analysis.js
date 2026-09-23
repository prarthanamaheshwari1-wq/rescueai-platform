console.log("AI Analysis Dashboard Loaded");

async function loadAnalysis() {

    try {

        const response = await fetch(
            "http://localhost:5000/api/ai-analysis"
        );

        const analyses = await response.json();

        const container =
            document.getElementById("analysisContainer");

        container.innerHTML = "";

        analyses.forEach(item => {

            let priorityClass = "low";

            if(item.AI_Priority === "Critical"){
                priorityClass = "critical";
            }
            else if(item.AI_Priority === "Moderate"){
                priorityClass = "moderate";
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
                        ${item.AI_Priority}
                    </p>

                    <p>
                        <strong>Summary:</strong>
                        ${item.AI_Summary}
                    </p>

                    <p>
                        <strong>Recommendation:</strong>
                        ${item.AI_Recommendation}
                    </p>

                </div>
            `;
        });

    } catch(error) {

        console.error(error);

    }

}

loadAnalysis();