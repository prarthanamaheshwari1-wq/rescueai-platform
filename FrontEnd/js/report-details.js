const params = new URLSearchParams(window.location.search);

const reportId =
    params.get("id") ||
    params.get("reportId");

// Automatically matches whatever hostname the user uses (localhost or 127.0.0.1)
const API_BASE = `${window.location.protocol}//${window.location.hostname}:5000/api`;


// ==========================================
// AUTHENTICATED FETCH
// ==========================================

async function authenticatedFetch(url, options = {}) {

    if (window.RescueAIAuthReady) {
        await window.RescueAIAuthReady;
    }

    let token = window.RescueAIAccessToken;

    if (!token && typeof window.ensureAuthenticated === "function") {
        try {
            token = await window.ensureAuthenticated();
        } catch (err) {
            console.error("Auth helper check failed:", err);
        }
    }

    if (!token) {

        console.error(
            "Access token not available."
        );

        window.location.replace(
            "authority-login.html"
        );

        throw new Error(
            "Authentication required."
        );
    }

    const headers = {
        ...(options.headers || {}),
        "Authorization": `Bearer ${token}`
    };

    const response = await fetch(url, {
        ...options,
        headers,
        credentials: "include"
    });

    if (response.status === 401) {
        console.error("Unauthorized request. Redirecting to login.");
        window.location.replace("authority-login.html");
        throw new Error("Unauthorized");
    }

    return response;
}

// ==========================================
// LOAD REPORT DETAILS
// ==========================================

async function loadReportDetails() {

    const container =
        document.getElementById("reportDetails");

    if (!reportId) {

        container.innerHTML =
            "<p style='color:red;'>No Report ID found.</p>";

        return;
    }


    try {

        const response =
            await authenticatedFetch(
                `${API_BASE}/reports/${reportId}`
            );


        if (!response.ok) {

            throw new Error(
                `Status ${response.status}`
            );
        }


        const rawData =
            await response.json();


        const report =
            Array.isArray(rawData)
                ? rawData[0]
                : rawData;


        if (!report) {

            container.innerHTML =
                "<p style='color:red;'>Report not found.</p>";

            return;
        }


        const aiAnalysis =
            report.AI_Analysis || {};


        // =========================================
        // EVIDENCE PHOTO
        // =========================================

        let photoUrl = null;


        if (report.Photo_Path) {

            const cleanPath =
                report.Photo_Path.replace(/\\/g, "/");


            photoUrl =
                `${window.location.protocol}//${window.location.hostname}:5000/${cleanPath}`;
        }


        // =========================================
        // DISPLAY REPORT DETAILS
        // =========================================

        container.innerHTML = `

            <h2>
                Report #${report.Report_id}
            </h2>


            <div class="detail">

                <span class="label">
                    Title:
                </span>

                ${report.Title || "N/A"}

            </div>


            <div class="detail">

                <span class="label">
                    Description:
                </span>

                ${report.Description || "N/A"}

            </div>


            <div class="detail">

                <span class="label">
                    Category:
                </span>

                ${report.Category || "N/A"}

            </div>


            <div class="detail">

                <span class="label">
                    Severity:
                </span>

                ${report.Severity || "N/A"}

            </div>


            <div class="detail">

                <span class="label">
                    Status:
                </span>

                ${report.Status || "N/A"}

            </div>


            <div class="detail">

                <span class="label">
                    Location:
                </span>

                ${report.Location_Name || "N/A"}

            </div>


            <div class="detail">

                <span class="label">
                    Created:
                </span>

                ${report.Created_At
                ? new Date(
                    report.Created_At
                ).toLocaleString()
                : "N/A"
            }

            </div>


            <!-- =====================================
                 AI DISASTER ANALYSIS
            ====================================== -->

            <hr>

            <h3>
                🤖 AI Disaster Analysis
            </h3>


            <div class="detail">

                <span class="label">
                    AI Category:
                </span>

                ${aiAnalysis.Category || "N/A"}

            </div>


            <div class="detail">

                <span class="label">
                    AI Severity:
                </span>

                ${aiAnalysis.Severity || "N/A"}

            </div>


            <div class="detail">

                <span class="label">
                    AI Priority:
                </span>

                ${aiAnalysis.Priority || "N/A"}

            </div>


            <div class="detail">

                <span class="label">
                    Misinformation Score:
                </span>

                ${aiAnalysis.Misinformation_Score ?? "N/A"}

            </div>


            <div class="detail">

                <span class="label">
                    AI Summary:
                </span>

                <p>
                    ${aiAnalysis.Summary ||
            "No AI summary available."
            }
                </p>

            </div>


            <div class="detail">

                <span class="label">
                    AI Visual Findings:
                </span>

                <p style="white-space: pre-line;">

                    ${aiAnalysis.Visual_Findings ||
            "No image evidence available."
            }

                </p>

            </div>


            <div class="detail">

                <span class="label">
                    AI Recommendation:
                </span>

                <p style="white-space: pre-line;">

                    ${aiAnalysis.Recommendation ||
            "No AI recommendation available."
            }

                </p>

            </div>


            <div class="detail">

                <span class="label">
                    Analyzed At:
                </span>

                ${aiAnalysis.Analyzed_At
                ? new Date(
                    aiAnalysis.Analyzed_At
                ).toLocaleString()
                : "N/A"
            }

            </div>


            <!-- =====================================
                 ASSIGNED RESOURCES
            ====================================== -->

            <hr>

            <h3>
                🚒 Assigned Resources
            </h3>


            ${report.Resources &&
                report.Resources.length > 0

                ? report.Resources.map(
                    res => `

                        <div class="detail">

                            <span class="label">
                                Resource Name:
                            </span>

                            ${res.Resource_Name}
                            (${res.Resource_Type || "N/A"})

                        </div>


                        <div class="detail">

                            <span class="label">
                                Resource Location:
                            </span>

                            ${res.Resource_Location || "N/A"}

                        </div>


                        <div class="detail">

                            <span class="label">
                                Quantity Remaining:
                            </span>

                            ${res.Quantity}

                        </div>


                        <div class="detail">

                            <span class="label">
                                Assignment Status:
                            </span>

                            ${res.Assignment_Status || "N/A"}

                        </div>


                        <br>

                    `
                ).join("")

                : `
                        <p style="color:orange;">
                            No resource assigned yet.
                        </p>
                    `
            }


            <!-- =====================================
                 ASSIGNED VOLUNTEERS
            ====================================== -->

            <hr>

            <h3>
                👨‍🚒 Assigned Volunteers
            </h3>


            ${report.Volunteers &&
                report.Volunteers.length > 0

                ? report.Volunteers.map(
                    vol => `

                        <div class="detail">

                            <span class="label">
                                Volunteer ID:
                            </span>

                            #${vol.Volunteer_id}

                        </div>


                        <div class="detail">

                            <span class="label">
                                Skill:
                            </span>

                            ${vol.Skill || "N/A"}

                        </div>


                        <div class="detail">

                            <span class="label">
                                Availability:
                            </span>

                            ${vol.Status || "N/A"}

                        </div>


                        <div class="detail">

                            <span class="label">
                                Location:
                            </span>

                            ${vol.Location || "N/A"}

                        </div>


                        <div class="detail">

                            <span class="label">
                                Assignment Status:
                            </span>

                            ${vol.Assignment_Status || "N/A"}

                        </div>


                        <br>

                    `
                ).join("")

                : `
                        <p style="color:orange;">
                            No volunteer assigned yet.
                        </p>
                    `
            }


            
<!-- =====================================
     EVIDENCE PHOTO & AUTHENTICITY BADGE
====================================== -->

<hr>

<h3>
    📷 Evidence Photo & AI Authenticity
</h3>

${(() => {
                const authenticity = aiAnalysis.Image_Authenticity || {};

                // Lowercase / TitleCase / String safety
                const rawPrediction = authenticity.prediction || authenticity.Prediction || "UNKNOWN";
                const prediction = String(rawPrediction).trim().toUpperCase();

                const status = authenticity.status || authenticity.Status || "unknown";
                const message = authenticity.message || authenticity.Message || "No authenticity details available.";

                let badgeStyle = "";
                let badgeTitle = "";

                if (prediction === "REAL") {
                    badgeStyle =
                        "background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb;";

                    badgeTitle =
                        "✅ Image Authenticity Verified";

                } else if (prediction === "FAKE") {
                    badgeStyle =
                        "background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb;";

                    badgeTitle =
                        "⚠️ Potential AI-Generated Image Detected";

                } else {
                    badgeStyle =
                        "background-color: #fff3cd; color: #856404; border: 1px solid #ffeeba;";

                    badgeTitle =
                        "⚠️ Authenticity Inconclusive — Manual Review Required";
                }

                return `
        <div style="${badgeStyle} padding: 12px 16px; border-radius: 8px; margin-bottom: 15px; font-family: sans-serif;">
            <strong style="font-size: 1.05em; display: block; margin-bottom: 8px;">
                ${badgeTitle}
            </strong>

            <span style="font-size: 0.9em; line-height: 1.5; display: block;">
                ${message}
            </span>

            <p style="margin: 8px 0 0; font-size: 0.9em;">
                <strong>Prediction:</strong>
                ${prediction}
            </p>

            <p style="margin: 4px 0 0; font-size: 0.9em;">
                <strong>Assessment status:</strong>
                ${status}
            </p>

            <p style="margin: 8px 0 0; font-size: 0.85em;">
                This is a preliminary AI assessment, not proof of image authenticity.
            </p>
        </div>
    `;
            })()}


        `;


    } catch (error) {

        console.error(
            "Report Details Error:",
            error
        );


        container.innerHTML = `

            <p style="color:red;">
                Failed to load report details.
            </p>

        `;
    }
}


// ==========================================
// INITIAL LOAD
// ==========================================

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        try {

            await window.RescueAIAuthReady;

            await loadReportDetails();

        } catch (error) {

            console.error(
                "Authentication initialization failed:",
                error
            );
        }
    }
);