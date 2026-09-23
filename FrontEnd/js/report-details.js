const params = new URLSearchParams(window.location.search);

const reportId = params.get("id");

async function loadReportDetails() {

    try {

        const response = await fetch(
            `http://localhost:5000/api/reports/${reportId}`
        );

        const report = await response.json();

        document.getElementById("reportDetails").innerHTML = `
            <h2>Report #${report.Report_id}</h2>

            <div class="detail">
                <span class="label">Title:</span>
                ${report.Title}
            </div>

            <div class="detail">
                <span class="label">Description:</span>
                ${report.Description}
            </div>

            <div class="detail">
                <span class="label">Category:</span>
                ${report.Category}
            </div>

            <div class="detail">
                <span class="label">Severity:</span>
                ${report.Severity}
            </div>

            <div class="detail">
                <span class="label">Status:</span>
                ${report.Status}
            </div>

            <div class="detail">
                <span class="label">Location:</span>
                ${report.Location_Name}
            </div>

            <div class="detail">
                <span class="label">Created:</span>
                ${new Date(report.Created_At).toLocaleString()}
            </div>
        `;

    } catch (error) {

        console.error(error);

    }
}

loadReportDetails();
