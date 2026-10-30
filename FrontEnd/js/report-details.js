const params = new URLSearchParams(window.location.search);

const reportId =
    params.get("id") ||
    params.get("reportId");

const validReportId =
    reportId && /^\d+$/.test(reportId) ? reportId : null;

// Ensures ISO timestamp strings missing a timezone offset are correctly parsed as UTC
// Parses timestamp directly without applying UTC timezone shifts
function formatDate(dateString) {
    if (!dateString) return "N/A";

    // Replaces space between date and time with 'T' for clean cross-browser parsing
    let safeString = String(dateString).trim().replace(" ", "T");

    // Remove any trailing 'Z' or offset if present to force local interpretation
    safeString = safeString.replace(/(Z|[+-]\d{2}:\d{2})$/, "");

    const date = new Date(safeString);
    return isNaN(date.getTime()) ? "N/A" : date.toLocaleString();
}

// Safely escape untrusted text before inserting it into HTML.
function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return entities[character];
    });
}

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

    if (!validReportId) {

        container.innerHTML =
            "<p style='color:red;'>No Report ID found.</p>";

        return;
    }


    try {

        const response =
            await authenticatedFetch(
                `${API_BASE}/reports/${validReportId}`
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

        if (typeof report.Photo_Path === "string" && report.Photo_Path.trim()) {
            const cleanPath = report.Photo_Path
                .replace(/\\/g, "/")
                .replace(/^\/+/, "");

            // Accept only paths inside the backend's uploads directory.
            if (
                cleanPath.startsWith("uploads/") &&
                !cleanPath.split("/").some(part => part === "." || part === "..") &&
                !/[<>"'`]/.test(cleanPath)
            ) {
                photoUrl = new URL(
                    cleanPath,
                    `${window.location.protocol}//${window.location.hostname}:5000/`
                ).href;
            }
        }



        // =========================================
        // DISPLAY REPORT DETAILS
        // =========================================

        container.innerHTML = `

            <h2>
                Report #${escapeHTML(report.Report_id)}
            </h2>


            <div class="detail">

                <span class="label">
                    Title:
                </span>

                ${escapeHTML(report.Title || "N/A")}

            </div>


            <div class="detail">

                <span class="label">
                    Description:
                </span>

                ${escapeHTML(report.Description || "N/A")}

            </div>


            <div class="detail">

                <span class="label">
                    Category:
                </span>

                ${escapeHTML(report.Category || "N/A")}

            </div>


            <div class="detail">

                <span class="label">
                    Severity:
                </span>

                ${escapeHTML(report.Severity || "N/A")}

            </div>


            <div class="detail">

                <span class="label">
                    Status:
                </span>

                ${escapeHTML(report.Status || "N/A")}

            </div>


            
<div class="detail">
    <span class="label">
        Location:
    </span>

    ${escapeHTML(report.Location_Name || "N/A")}
</div>

<div class="detail">
    <span class="label">
        Latitude:
    </span>

    ${escapeHTML(report.Latitude ?? "N/A")}
</div>

<div class="detail">
    <span class="label">
        Longitude:
    </span>

    ${escapeHTML(report.Longitude ?? "N/A")}
</div>



            <div class="detail">

                <span class="label">
                    Created:
                </span>

                ${escapeHTML(formatDate(report.Created_At))}

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

                ${escapeHTML(aiAnalysis.Category || "N/A")}

            </div>


            <div class="detail">

                <span class="label">
                    AI Severity:
                </span>

                ${escapeHTML(aiAnalysis.Severity || "N/A")}

            </div>


            <div class="detail">

                <span class="label">
                    AI Priority:
                </span>

                ${escapeHTML(aiAnalysis.Priority || "N/A")}

            </div>


            <div class="detail">

                <span class="label">
                    Misinformation Score:
                </span>

                ${escapeHTML(aiAnalysis.Misinformation_Score ?? "N/A")}

            </div>


            <div class="detail">

                <span class="label">
                    AI Summary:
                </span>

                <p>
                    
                    ${escapeHTML(
            aiAnalysis.Summary || "No AI summary available."
        )}
                </p>

            </div>


            <div class="detail">

                <span class="label">
                    AI Visual Findings:
                </span>

                <p style="white-space: pre-line;">

                    
                    ${escapeHTML(
            aiAnalysis.Visual_Findings || "No image evidence available."
        )}


                </p>

            </div>


            <div class="detail">

                <span class="label">
                    AI Recommendation:
                </span>

                <p style="white-space: pre-line;">

                    ${escapeHTML(
            aiAnalysis.Recommendation || "No AI recommendation available."
        )}

                </p>

            </div>


            <div class="detail">

                <span class="label">
                    Analyzed At:
                </span>

                ${escapeHTML(formatDate(aiAnalysis.Analyzed_At))}

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

                            ${escapeHTML(res.Resource_Name || "N/A")}
                            (${escapeHTML(res.Resource_Type || "N/A")})
                        </div>


                        <div class="detail">

                            <span class="label">
                                Resource Location:
                            </span>

                            ${escapeHTML(res.Resource_Location || "N/A")}

                        </div>


                        <div class="detail">

                            <span class="label">
                                Quantity Remaining:
                            </span>

                            ${escapeHTML(res.Quantity ?? "N/A")}

                        </div>


                        <div class="detail">

                            <span class="label">
                                Assignment Status:
                            </span>

                            ${escapeHTML(res.Assignment_Status || "N/A")}

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

                            #${escapeHTML(vol.Volunteer_id ?? "N/A")}

                        </div>


                        <div class="detail">

                            <span class="label">
                                Skill:
                            </span>

                            ${escapeHTML(vol.Skill || "N/A")}

                        </div>


                        <div class="detail">

                            <span class="label">
                                Availability:
                            </span>

                            ${escapeHTML(vol.Status || "N/A")}

                        </div>


                        <div class="detail">

                            <span class="label">
                                Location:
                            </span>

                            ${escapeHTML(vol.Location || "N/A")}

                        </div>


                        <div class="detail">

                            <span class="label">
                                Assignment Status:
                            </span>

                            ${escapeHTML(vol.Assignment_Status || "N/A")}

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
                const duplicate = report.PossibleDuplicate || {};
                const checkCompleted = duplicate.CheckCompleted === true;
                const isDuplicate = duplicate.IsPossibleDuplicate === true;

                if (!checkCompleted) {
                    return `
            <div style="margin: 12px 0; padding: 14px 16px; border: 1px solid #e5b7b7; border-radius: 8px; background: #fff1f1; color: #8a3030; font-family: sans-serif;">
                <strong>⚠️ Duplicate Check Unavailable</strong>
                <p>No conclusion about image uniqueness can be made because RescueAI could not confirm that the duplicate check completed successfully.</p>
            </div>
        `;
                }

                if (!isDuplicate) {
                    return `
            <div style="margin: 12px 0; padding: 14px 16px; border: 1px solid #b7dfc4; border-radius: 8px; background: #f0fff4; color: #22543d; font-family: sans-serif;">
                <strong>Image Duplicate Check</strong>
                <p>No possible duplicate was identified among the images checked in RescueAI. This does not prove that the image is unique or authentic.</p>
            </div>
        `;
                }

                return `
        <div style="margin: 12px 0; padding: 14px 16px; border: 1px solid #f0d58c; border-radius: 8px; background: #fff8e5; color: #795b12; font-family: sans-serif;">
            <strong>⚠️ Possible Duplicate Image</strong>
            <p>A similar image was found in an earlier RescueAI report. This does not mean the current disaster is false. Both reports must be preserved and assessed.</p>
            <p>
                <strong>Related report ID:</strong>
                ${escapeHTML(duplicate.SimilarReportId ?? "Unavailable")}
                <br>
                <strong>Image distance:</strong>
                ${escapeHTML(duplicate.HammingDistance ?? "Unavailable")}
            </p>
        </div>
    `;
            })()}


${photoUrl
                ? `
        <div style="margin: 16px 0 24px; text-align: center;">
            <img
                src="${photoUrl}"
                alt="Evidence photo for report #${escapeHTML(report.Report_id)}"
                style="
                    display: block;
                    width: 100%;
                    max-width: 800px;
                    max-height: 500px;
                    object-fit: contain;
                    margin: 0 auto;
                    border-radius: 10px;
                    border: 1px solid #ddd;
                    background-color: #f5f5f5;
                "
                onerror="this.style.display='none'; this.nextElementSibling.style.display='block';"
            >

            <p style="display: none; color: #b42318; margin-top: 10px;">
                The evidence photo could not be loaded. Please check the stored photo path and backend static-file configuration.
            </p>
        </div>
    `
                : `
        <p style="color: #b42318;">
            No evidence photo path is available for this report.
        </p>
    `
            }


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
                        "background-color: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb;";

                    badgeTitle =
                        "ℹ️ No Strong AI Indicators Detected";

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
        <div style="${badgeStyle} padding: 12px 16px; border-radius: 8px; margin-bottom: 15px; font-family: sans-serif; overflow-wrap: anywhere;">
            <strong style="font-size: 1.05em; display: block; margin-bottom: 12px; line-height: 1.5;">
                ${badgeTitle}
            </strong>

            <div style="font-size: 0.9em; line-height: 1.6; display: block; margin-top: 4px;">
                ${escapeHTML(message)}
            </div>

            <p style="margin: 8px 0 0; font-size: 0.9em;">
                <strong>Prediction:</strong>
                ${escapeHTML(prediction)}
            </p>

            <p style="margin: 4px 0 0; font-size: 0.9em;">
                <strong>Assessment status:</strong>
                ${escapeHTML(status)}
            </p>

            <p style="margin: 8px 0 0; font-size: 0.85em;">
                This is a preliminary AI assessment, not proof of image authenticity.
            </p>
        </div>
    `;
            })()}


            ${(() => {
                const verification =
                    aiAnalysis.Image_Source_Verification || {};

                const status = String(
                    verification.Status || "unavailable"
                ).toLowerCase();

                const message =
                    verification.Message ||
                    "Online source verification is unavailable.";

                let title = "⚠️ Online Source Verification Unavailable";
                let style =
                    "background: #fff3cd; color: #856404; border: 1px solid #ffeeba;";

                if (status === "matches_found") {
                    title = "⚠️ Similar Images Found Online";
                    style =
                        "background: #fff8e5; color: #795b12; border: 1px solid #f0d58c;";
                } else if (status === "no_matches_found") {
                    title = "No Online Matches Found";
                    style =
                        "background: #f0fff4; color: #22543d; border: 1px solid #b7dfc4;";
                }

                return `
        <hr>
        <h3>🌐 Image Source Verification</h3>

        <div style="${style} padding: 12px 16px; border-radius: 8px; margin: 12px 0; overflow-wrap: anywhere;">
            <strong>${title}</strong>
            <p>${escapeHTML(message)}</p>
        </div>
    `;
            })()}

            ${(() => {
                const crossCheck =
                    aiAnalysis.Disaster_Cross_Check || {};

                const status = String(
                    crossCheck.Status || "unavailable"
                ).toLowerCase();

                const message =
                    crossCheck.Message ||
                    "Disaster cross-check information is unavailable.";

                let title = "⚠️ Disaster Cross-Check Unavailable";
                let style =
                    "background: #fff3cd; color: #856404; border: 1px solid #ffeeba;";

                if (status === "supporting_evidence") {
                    title = "ℹ️ Supporting Disaster Evidence Found";
                    style =
                        "background: #f0fff4; color: #22543d; border: 1px solid #b7dfc4;";
                } else if (status === "no_direct_correlation") {
                    title = "⚠️ No Direct Disaster Correlation Found";
                    style =
                        "background: #fff8e5; color: #795b12; border: 1px solid #f0d58c;";
                }

                return `
                    <hr>
                    <h3>🌦️ Trusted Disaster & Weather Cross-Check</h3>

                    <div style="${style} padding: 12px 16px; border-radius: 8px; margin: 12px 0; overflow-wrap: anywhere;">
                        <strong>${title}</strong>
                        <p>${escapeHTML(message)}</p>
                        <p>
                            <strong>Source:</strong>
                            ${escapeHTML(crossCheck.Source || "Unavailable")}
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