console.log("Verification Dashboard Loaded");

async function loadPendingReports() {

    try {

        const response = await fetch(
            "http://localhost:5000/api/reports/pending"
        );

        const reports = await response.json();

        const container =
            document.getElementById("reportsContainer");

        container.innerHTML = "";

        reports.forEach(report => {

            container.innerHTML += `
                <div class="report-card">

                    <h2>
                        Report #${report.Report_id}
                    </h2>

                    <p>
                        <strong>Title:</strong>
                        ${report.Title}
                    </p>

                    <p>
                        <strong>Category:</strong>
                        ${report.Category}
                    </p>

                    <p>
                        <strong>Severity:</strong>
                        ${report.Severity}
                    </p>

                    <p>
                        <strong>Location:</strong>
                        ${report.Location_Name}
                    </p>

                    <p>
                        <strong>Status:</strong>
                        ${report.Status}
                    </p>

                    <p>
                        <strong>AI Priority:</strong>
                            ${report.AI_Priority}
                    </p>

                    <p>
                        <strong>Misinformation Score:</strong>
                            ${report.Misinformation_Score}%
                    </p>

                    <p>
                        <strong>AI Summary:</strong>
                            ${report.AI_Summary}
                    </p>

                    <p>
                        <strong>AI Recommendation:</strong>
                            ${report.AI_Recommendation}
                    </p>

                    ${report.Misinformation_Score >= 50
                        ? `
                        <div style="
                            background:#fee2e2;
                            color:#b91c1c;
                            padding:10px;
                            border-radius:6px;
                            margin-top:10px;
                            font-weight:bold;
                        ">
                            ⚠ Potential Misinformation Detected
                        </div>
                        `
                        : ""
                    }

                    <div class="button-group">

                        <button
                            class="verify-btn"
                            onclick="verifyReport(${report.Report_id})"
                        >
                            Verify
                        </button>

                        <button
                            class="reject-btn"
                            onclick="rejectReport(${report.Report_id})"
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
        });

    } catch (error) {

        console.error(error);

    }

}

async function verifyReport(reportId) {

    try {

        await fetch(
            `http://localhost:5000/api/reports/${reportId}/verify`,
            {
                method: "PUT"
            }
        );

        alert("Report Verified");

        loadPendingReports();

    } catch (error) {

        console.error(error);

    }

}

async function rejectReport(reportId) {

    try {

        await fetch(
            `http://localhost:5000/api/reports/${reportId}/reject`,
            {
                method: "PUT"
            }
        );

        alert("Report Rejected");

        loadPendingReports();

    } catch (error) {

        console.error(error);

    }

}

loadPendingReports();