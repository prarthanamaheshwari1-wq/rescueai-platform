const params = new URLSearchParams(window.location.search);

// Reads either 'id' or 'reportId' from URL query params
const reportId = params.get("id") || params.get("reportId");

async function loadReportDetails() {

    const container = document.getElementById("reportDetails");

    if (!reportId) {
        if (container) {
            container.innerHTML = "<p style='color:red;'>No Report ID found in URL.</p>";
        }
        return;
    }

    try {

        const response = await fetch(
            `http://localhost:5000/api/reports/${reportId}`
        );

        if (!response.ok) {
            throw new Error(`Failed to fetch report details (Status: ${response.status})`);
        }

        const rawData = await response.json();

        // FIX: Extract first object if backend returns an array
        const report = Array.isArray(rawData) ? rawData[0] : rawData;

        if (!report || !report.Report_id) {
            container.innerHTML = "<p style='color:red;'>Report not found.</p>";
            return;
        }

        // Resolving photo path cleanly
        let photoUrl = null;
        if (report.Photo_Path) {
            const cleanPath = report.Photo_Path.replace(/\\/g, "/");
            photoUrl = `http://localhost:5000/${cleanPath}`;
        }

        container.innerHTML = `

            <h2>Report #${report.Report_id}</h2>

            <div class="detail">
                <span class="label">Title:</span>
                ${report.Title || "N/A"}
            </div>

            <div class="detail">
                <span class="label">Description:</span>
                ${report.Description || "N/A"}
            </div>

            <div class="detail">
                <span class="label">Category:</span>
                ${report.Category || "N/A"}
            </div>

            <div class="detail">
                <span class="label">Severity:</span>
                ${report.Severity || "N/A"}
            </div>

            <div class="detail">
                <span class="label">Status:</span>
                ${report.Report_Status || report.Status || "N/A"}
            </div>

            <div class="detail">
                <span class="label">Location:</span>
                ${report.Location_Name || "N/A"}
            </div>

            <div class="detail">
                <span class="label">Created:</span>
                ${report.Created_At ? new Date(report.Created_At).toLocaleString() : "N/A"}
            </div>

        <hr>

        <h3>🚒 Assigned Resource</h3>

        ${
            report.Resource_Name && report.Resource_Name !== "None"
                ? `
                    <div class="detail">
                        <span class="label">Resource Name:</span>
                        ${report.Resource_Name}
                    </div>

                    <div class="detail">
                        <span class="label">Resource Type:</span>
                        ${report.Resource_Type || "N/A"}
                    </div>

                    <div class="detail">
                        <span class="label">Resource Status:</span>
                        ${report.Resource_Status || "N/A"}
                    </div>

                    <div class="detail">
                        <span class="label">Assignment Status:</span>
                        ${report.Assignment_Status || "N/A"}
                    </div>
                `
                : `
                    <p style="color:orange;">
                        No resource assigned yet.
                    </p>
                `
        }

        <hr>

        <h3>📷 Evidence Photo</h3>

        ${
            photoUrl
                ? `
                    <img
                        src="${photoUrl}"
                        class="report-image"
                        alt="Disaster Evidence"
                        style="max-width:100%; border-radius:8px;"
                    >
                `
                : `
                    <p>No photo available</p>
                `
        }

    `;

    } catch (error) {

        console.error("Error loading report details:", error);

        if (container) {
            container.innerHTML = `
                <p style="color:red;font-weight:bold;">
                    Unable to load report details. Please try again.
                </p>
            `;
        }

    }
}

document.addEventListener("DOMContentLoaded", loadReportDetails);