const params = new URLSearchParams(window.location.search);

const reportId =
    params.get("id") ||
    params.get("reportId");


async function loadReportDetails() {

    const container =
        document.getElementById("reportDetails");


    if (!reportId) {

        container.innerHTML =
            "<p style='color:red;'>No Report ID found.</p>";

        return;
    }


    try {

        const response = await fetch(
            `http://localhost:5000/api/reports/${reportId}`
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

        const aiAnalysis = report.AI_Analysis || {};


        // =========================================
        // EVIDENCE PHOTO
        // =========================================

        let photoUrl = null;


        if (report.Photo_Path) {

            const cleanPath =
                report.Photo_Path.replace(/\\/g, "/");


            photoUrl =
                `http://localhost:5000/${cleanPath}`;
        }


        // =========================================
        // DISPLAY REPORT DETAILS
        // =========================================

        container.innerHTML = `

            <h2>
                Report #${report.Report_id}
            </h2>


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

                ${report.Status || "N/A"}

            </div>


            <div class="detail">

                <span class="label">Location:</span>

                ${report.Location_Name || "N/A"}

            </div>


            <div class="detail">

                <span class="label">Created:</span>

                ${report.Created_At
                ? new Date(report.Created_At)
                    .toLocaleString()
                : "N/A"
            }

            </div>


            <!-- =====================================
                 AI DISASTER ANALYSIS
            ====================================== -->

            <hr>

            <h3>🤖 AI Disaster Analysis</h3>


            <div class="detail">

                <span class="label">AI Category:</span>

                ${aiAnalysis.Category || "N/A"}

            </div>


            <div class="detail">

                <span class="label">AI Severity:</span>

                ${aiAnalysis.Severity || "N/A"}

            </div>


            <div class="detail">

                <span class="label">AI Priority:</span>

                ${aiAnalysis.Priority || "N/A"}

            </div>


            <div class="detail">

                <span class="label">Misinformation Score:</span>

                ${aiAnalysis.Misinformation_Score ?? "N/A"}

            </div>


            <div class="detail">

                <span class="label">AI Summary:</span>

                <p>
                    ${aiAnalysis.Summary || "No AI summary available."}
                </p>

            </div>


            <div class="detail">

                <span class="label">AI Visual Findings:</span>

                <p style="white-space: pre-line;">
                    ${aiAnalysis.Visual_Findings || "No image evidence available."}
                </p>

            </div>


            <div class="detail">

                <span class="label">AI Recommendation:</span>

                <p style="white-space: pre-line;">

                   ${
                        aiAnalysis.Recommendation ||
                        "No AI recommendation available."
                    }

                </p>

            </div>


            <div class="detail">

                <span class="label">Analyzed At:</span>

                ${aiAnalysis.Analyzed_At
                ? new Date(aiAnalysis.Analyzed_At)
                    .toLocaleString()
                : "N/A"
            }

            </div>


            <!-- =====================================
                 ASSIGNED RESOURCE
            ====================================== -->

            <hr>

            <h3>🚒 Assigned Resource</h3>


            ${report.Resource_Name &&
                report.Resource_Name !== "None"

                ?

                `

                <div class="detail">

                    <span class="label">
                        Resource Name:
                    </span>

                    ${report.Resource_Name}

                </div>


                <div class="detail">

                    <span class="label">
                        Resource Type:
                    </span>

                    ${report.Resource_Type || "N/A"}

                </div>


                <div class="detail">

                    <span class="label">
                        Resource Status:
                    </span>

                    ${report.Resource_Status || "N/A"}

                </div>


                <div class="detail">

                    <span class="label">
                        Assignment Status:
                    </span>

                    ${report.Assignment_Status || "N/A"}

                </div>

                `

                :

                `

                <p style="color:orange;">

                    No resource assigned yet.

                </p>

                `
            }


            <!-- =====================================
                 ASSIGNED VOLUNTEER
            ====================================== -->

            <hr>

            <h3>👨‍🚒 Assigned Volunteer</h3>


            ${report.Volunteer_id &&
                report.Volunteer_id !== 0

                ?

                `

                <div class="detail">

                    <span class="label">
                        Volunteer ID:
                    </span>

                    ${report.Volunteer_id}

                </div>


                <div class="detail">

                    <span class="label">
                        Skill:
                    </span>

                    ${report.Volunteer_Skill || "N/A"}

                </div>


                <div class="detail">

                    <span class="label">
                        Availability:
                    </span>

                    ${report.Volunteer_Status || "N/A"}

                </div>


                <div class="detail">

                    <span class="label">
                        Location:
                    </span>

                    ${report.Volunteer_Location || "N/A"}

                </div>


                <div class="detail">

                    <span class="label">
                        Assignment Status:
                    </span>

                    ${report.Volunteer_Assignment_Status
                || "N/A"
                }

                </div>

                `

                :

                `

                <p style="color:orange;">

                    No volunteer assigned yet.

                </p>

                `
            }


            <!-- =====================================
                 EVIDENCE PHOTO
            ====================================== -->

            <hr>

            <h3>📷 Evidence Photo</h3>


            ${photoUrl

                ?

                `

                <img

                    src="${photoUrl}"

                    alt="Evidence"

                    class="report-image"

                    style="
                        max-width:100%;
                        border-radius:8px;
                    "

                >

                `

                :

                `

                <p>
                    No photo available
                </p>

                `
            }

        `;


    } catch (error) {

        console.error(error);


        container.innerHTML = `

            <p style="color:red;">

                Failed to load report details.

            </p>

        `;

    }

}


document.addEventListener(
    "DOMContentLoaded",
    loadReportDetails
);