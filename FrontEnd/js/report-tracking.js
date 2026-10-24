console.log("report-tracking.js loaded");

document.addEventListener("DOMContentLoaded", () => {

    const trackBtn =
        document.getElementById("trackBtn");

    const reportResult =
        document.getElementById("reportResult");

    const reportIdInput =
        document.getElementById("reportId");

    const params =
        new URLSearchParams(window.location.search);

    const reportIdFromUrl =
        params.get("reportId");


    console.log(
        "Track Button Element:",
        trackBtn
    );


    if (!trackBtn) {

        console.error(
            "Error: 'trackBtn' element not found in HTML!"
        );

        return;
    }


    if (reportIdFromUrl) {

        reportIdInput.value =
            reportIdFromUrl;
    }


    trackBtn.addEventListener(
        "click",
        async () => {

            console.log(
                "Track button clicked"
            );



            const reportId = reportIdInput.value.trim();

            if (!reportId) {
                alert("Please enter a Report ID.");
                return;
            }

            if (!/^[1-9]\d*$/.test(reportId)) {
                alert("Please enter a valid positive Report ID.");
                return;
            }



            reportResult.innerHTML =
                "<p>Fetching report details...</p>";


            try {

                const API_BASE = `${window.location.protocol}//${window.location.hostname}:5000/api`;

                // ==========================================
                // PUBLIC REPORT TRACKING API
                // ==========================================

                const response = await fetch(
                    `${API_BASE}/reports/tracking/${reportId}`
                );


                if (!response.ok) {

                    throw new Error(
                        `Report not found (Status: ${response.status})`
                    );
                }


                const result =
                    await response.json();


                console.log(
                    "Raw API Result:",
                    result
                );


                const data =
                    Array.isArray(result)
                        ? result[0]
                        : result;


                console.log(
                    "Report Data Object:",
                    data
                );


                if (!data) {

                    throw new Error(
                        "No report data found in response"
                    );
                }



                // ==========================================
                // TIMELINE STATUS LOGIC
                // ==========================================

                const currentStatus = (
                    data.Report_Status ||
                    data.Status ||
                    ""
                ).trim();

                let submittedClass = "pending";
                let verifiedClass = "pending";
                let resolvedClass = "pending";

                if (currentStatus === "Submitted") {
                    submittedClass = "completed";
                }
                else if (currentStatus === "Verified") {
                    submittedClass = "completed";
                    verifiedClass = "completed";
                }
                else if (currentStatus === "Resolved") {
                    submittedClass = "completed";
                    verifiedClass = "completed";
                    resolvedClass = "completed";
                }

                const rejectedMessage =
                    currentStatus === "Rejected"
                        ? '<p class="rejected-status">❌ This report has been rejected.</p>'
                        : "";



                // ==========================================
                // PHOTO LOGIC
                // ==========================================

                let photoUrl = null;


                if (data.Photo_Path) {

                    const normalizedPath =
                        data.Photo_Path.replace(
                            /\\/g,
                            "/"
                        );


                    const filename =
                        normalizedPath
                            .split("/")
                            .pop();


                    if (filename) {

                        photoUrl =
                            `${window.location.protocol}//${window.location.hostname}:5000/uploads/${filename}`;
                    }
                }


                // ==========================================
                // DISPLAY REPORT
                // ==========================================

                reportResult.innerHTML = `

                    <h2>
                        Report #${data.Report_id}
                    </h2>


                    <p>

                        <strong>
                            Title:
                        </strong>

                        ${data.Title || "N/A"}

                    </p>


                    <p>

                        <strong>
                            Description:
                        </strong>

                        ${data.Description || "N/A"}

                    </p>


                    <p>

                        <strong>
                            Category:
                        </strong>

                        ${data.Category || "N/A"}

                    </p>


                    <p>

                        <strong>
                            Severity:
                        </strong>

                        ${data.Severity || "N/A"}

                    </p>


                    <p>

                        <strong>
                            Priority:
                        </strong>

                        ${data.Priority || "N/A"}

                    </p>


                    <p>

                        <strong>
                            Status:
                        </strong>

                        ${currentStatus || "N/A"}

                    </p>


                    <div class="timeline">

                        <h3>
                            Tracking Progress
                        </h3>


                        <div
                            class="timeline-step ${submittedClass}"
                        >
                            ✅ Submitted
                        </div>


                        <div
                            class="timeline-step ${verifiedClass}"
                        >
                            🔍 Verified
                        </div>


                        <div
                            class="timeline-step ${resolvedClass}"
                        >
                            🎯 Resolved
                        </div>

                    </div>

                    ${rejectedMessage}


                    <p>

                        <strong>
                            Location:
                        </strong>

                        ${data.Location_Name || "N/A"}

                    </p>


                    <p>

                        <strong>
                            Created:
                        </strong>

                        ${data.Created_At
                        ? new Date(
                            data.Created_At
                        ).toLocaleString()
                        : "N/A"
                    }

                    </p>


                    ${photoUrl

                        ? `

                            <div
                                style="margin-top:15px;"
                            >

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

                            <p
                                style="
                                    margin-top:15px;
                                    color:#777;
                                "
                            >

                                <em>
                                    No photo attached to this report
                                </em>

                            </p>

                            `
                    }


                    <div
                        style="margin-top:20px;"
                    >

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

            }

            catch (error) {

                console.error(
                    "Fetch Error:",
                    error
                );


                reportResult.innerHTML = `

                    <p
                        style="
                            color:red;
                            font-weight:bold;
                        "
                    >
                        Report not found or server error.
                    </p>

                `;
            }

        }
    );

    
    // ==========================================
    // LOAD PUBLIC DISASTER REPORT FEED
    // ==========================================

    async function loadPublicDisasterFeed() {
        const feedList =
            document.getElementById("disasterFeedList");

        const feedMessage =
            document.getElementById("disasterFeedMessage");

        if (!feedList || !feedMessage) {
            console.error("Public disaster feed elements not found.");
            return;
        }

        const API_BASE =
            `${window.location.protocol}//${window.location.hostname}:5000/api`;

        try {
            feedMessage.textContent = "Loading disaster reports...";

            const response = await fetch(
                `${API_BASE}/reports/public-feed`
            );

            if (!response.ok) {
                throw new Error(
                    `Failed to load reports: ${response.status}`
                );
            }

            const reports = await response.json();

            feedList.replaceChildren();

            if (!Array.isArray(reports) || reports.length === 0) {
                feedMessage.textContent =
                    "No public disaster reports are available yet.";
                return;
            }

            feedMessage.textContent =
                `${reports.length} disaster report(s) found.`;

            reports.forEach((report) => {
                const card = document.createElement("article");
                card.className = "disaster-card";

                const heading = document.createElement("h3");
                heading.textContent =
                    `Report #${report.Report_id} — ${report.Title || "Untitled report"}`;
                card.appendChild(heading);

                const status = document.createElement("span");
                status.className = "disaster-status";

                const currentStatus =
                    String(report.Status || "Unknown").trim();

                if (currentStatus.toLowerCase() === "submitted") {
                    status.textContent = "Not yet verified";
                } else if (currentStatus.toLowerCase() === "verified") {
                    status.textContent = "Authority verified";
                    status.classList.add("verified");
                } else if (currentStatus.toLowerCase() === "resolved") {
                    status.textContent = "Resolved";
                    status.classList.add("resolved");
                } else {
                    status.textContent = `Status: ${currentStatus}`;
                }

                card.appendChild(status);

                function addDetail(label, value) {
                    const paragraph = document.createElement("p");
                    const strong = document.createElement("strong");

                    strong.textContent = `${label}: `;
                    paragraph.appendChild(strong);
                    paragraph.appendChild(
                        document.createTextNode(
                            value === null || value === undefined || value === ""
                                ? "N/A"
                                : String(value)
                        )
                    );

                    card.appendChild(paragraph);
                }

                addDetail("Description", report.Description);
                addDetail("Category", report.Category);
                addDetail("Severity", report.Severity);
                addDetail("Priority", report.Priority);
                addDetail("Location", report.Location_Name);

                addDetail(
                    "Reported",
                    report.Created_At
                        ? new Date(report.Created_At).toLocaleString()
                        : "N/A"
                );

                if (report.Photo_Path) {
                    const normalizedPath =
                        String(report.Photo_Path).replace(/\\/g, "/");

                    const filename = normalizedPath.split("/").pop();

                    if (filename && filename !== "." && filename !== "..") {
                        const image = document.createElement("img");

                        image.src =
                            `${window.location.protocol}//${window.location.hostname}:5000/uploads/${encodeURIComponent(filename)}`;

                        image.alt = `Photo for report ${report.Report_id}`;

                        image.addEventListener("error", () => {
                            image.remove();
                        });

                        card.appendChild(image);
                    }
                }

                feedList.appendChild(card);
            });
        } catch (error) {
            console.error("Public disaster feed error:", error);

            feedList.replaceChildren();
            feedMessage.textContent =
                "Unable to load disaster reports. Please try again later.";
        }
    }

    // Load the public feed when the page opens.
    loadPublicDisasterFeed();



    // ==========================================
    // AUTO-SEARCH IF REPORT ID COMES FROM URL
    // ==========================================

    if (reportIdFromUrl) {

        trackBtn.click();
    }

});