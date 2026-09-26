console.log("report-tracking.js loaded");

document.addEventListener("DOMContentLoaded", () => {

    const trackBtn = document.getElementById("trackBtn");
    const reportResult = document.getElementById("reportResult");
    const reportIdInput = document.getElementById("reportId");

    const params = new URLSearchParams(window.location.search);
    const reportIdFromUrl = params.get("reportId");

    console.log("Track Button Element:", trackBtn);

    if (!trackBtn) {
        console.error("Error: 'trackBtn' element not found in HTML!");
        return;
    }

    if (reportIdFromUrl) {
        reportIdInput.value = reportIdFromUrl;
    }

    trackBtn.addEventListener("click", async () => {

        console.log("Track button clicked");

        const reportId = reportIdInput.value.trim();

        if (!reportId) {
            alert("Please enter a Report ID");
            return;
        }

        reportResult.innerHTML = "<p>Fetching report details...</p>";

        try {

            const response = await fetch(
                `http://localhost:5000/api/reports/${reportId}`
            );

            if (!response.ok) {
                throw new Error(`Report not found (Status: ${response.status})`);
            }

            // 1. FIX: Parse JSON response first
            const result = await response.json();
            console.log("Raw API Result:", result);

            // 2. Extract first report object safely
            const data = Array.isArray(result)
                ? result[0]
                : result;

            console.log("Report Data Object:", data);

            if (!data) {
                throw new Error("No report data found in response");
            }

            // Timeline Status Logic (Handles both Report_Status and Status)
            const currentStatus = data.Report_Status || data.Status || "";

            let submittedClass = "pending";
            let verifiedClass = "pending";
            let resolvedClass = "pending";

            if (currentStatus === "Submitted") {

                submittedClass = "completed";

            } else if (currentStatus === "Verified") {

                submittedClass = "completed";
                verifiedClass = "completed";

            } else if (currentStatus === "Resolved") {

                submittedClass = "completed";
                verifiedClass = "completed";
                resolvedClass = "completed";
            }

            // Photo Logic

            let photoUrl = null;

            if (data.Photo_Path) {

                const normalizedPath =
                    data.Photo_Path.replace(/\\/g, "/");

                const filename =
                    normalizedPath.split("/").pop();

                if (filename) {

                    photoUrl =
                        `http://localhost:5000/uploads/${filename}`;

                }
            }

            reportResult.innerHTML = `

                <h2>Report #${data.Report_id}</h2>

                <p><strong>Title:</strong> ${data.Title || "N/A"}</p>

                <p><strong>Description:</strong> ${data.Description || "N/A"}</p>

                <p><strong>Category:</strong> ${data.Category || "N/A"}</p>

                <p><strong>Severity:</strong> ${data.Severity || "N/A"}</p>

                <p><strong>Priority:</strong> ${data.Priority || "N/A"}</p>

                <p><strong>Status:</strong> ${currentStatus || "N/A"}</p>

                <div class="timeline">

                    <h3>Tracking Progress</h3>

                    <div class="timeline-step ${submittedClass}">
                        ✅ Submitted
                    </div>

                    <div class="timeline-step ${verifiedClass}">
                        🔍 Verified
                    </div>

                    <div class="timeline-step ${resolvedClass}">
                        🎯 Resolved
                    </div>

                </div>

                <p><strong>Location:</strong> ${data.Location_Name || "N/A"}</p>

                <p><strong>Created:</strong>
                    ${data.Created_At
                        ? new Date(data.Created_At).toLocaleString()
                        : "N/A"}
                </p>

                <p><strong>Resource Name:</strong> ${data.Resource_Name || "Not Assigned"}</p>

                <p><strong>Resource Type:</strong> ${data.Resource_Type || "N/A"}</p>

                <p><strong>Resource Status:</strong> ${data.Resource_Status || "N/A"}</p>

                <p><strong>Assignment Status:</strong> ${data.Assignment_Status || "N/A"}</p>      

                ${photoUrl
                    ? `
                    <div style="margin-top:15px;">
                        <img
                            src="${photoUrl}"
                            alt="Report Photo"
                            style="
                                max-width:100%;
                                border-radius:8px;
                                border:1px solid #ccc;
                            "
                        />
                    </div>
                    `
                    : `
                    <p style="margin-top:15px;color:#777;">
                        <em>No photo attached to this report</em>
                    </p>
                    `
                }

                <div style="margin-top:20px;">

                    <a
                        href="report-details.html?id=${data.Report_id}"
                        style="
                            background:#2563eb;
                            color:white;
                            padding:10px 15px;
                            text-decoration:none;
                            border-radius:6px;
                            display:inline-block;
                        "
                    >
                        View Full Details
                    </a>

                </div>
            `;

        } catch (error) {

            console.error("Fetch Error:", error);

            reportResult.innerHTML = `
                <p style="color:red;font-weight:bold;">
                    Report not found or server error.
                </p>
            `;
        }

    }
    );

    // Auto-search if reportId comes from URL

    if (reportIdFromUrl) {
        trackBtn.click();
    }

});