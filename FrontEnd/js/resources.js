console.log("Resources Dashboard Loaded");


// ==========================================
// API BASE
// ==========================================

// ==========================================
// API BASE
// ==========================================

const API_BASE =
    `${window.location.protocol}//${window.location.hostname}:5000/api`;


// ==========================================
// AUTHENTICATED FETCH
// ==========================================

async function authenticatedFetch(
    url,
    options = {}
) {

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

        "Authorization":
            `Bearer ${token}`

    };


    const response = await fetch(
        url,
        {
            ...options,
            headers,
            credentials: "include"
        }
    );

    if (response.status === 401) {
        console.error("Unauthorized request. Redirecting to login.");
        window.location.replace("authority-login.html");
        throw new Error("Unauthorized");
    }

    return response;

}


// ==========================================
// LOAD RESOURCES
// ==========================================

async function loadResources() {

    try {

        const response =
            await authenticatedFetch(
                `${API_BASE}/resources`
            );


        if (!response.ok) {

            throw new Error(
                "Failed to fetch resources"
            );

        }


        const resources =
            await response.json();


        const tableBody =
            document.getElementById(
                "resourceTableBody"
            );


        tableBody.innerHTML = "";


        // ==========================================
        // CALCULATE RESOURCE ANALYTICS
        // ==========================================

        // ==========================================
        // CALCULATE RESOURCE ANALYTICS
        // ==========================================

        let totalUnits = 0;
        let availableUnits = 0;
        let deployedUnits = 0;

        let availableRecords = 0;
        let deployedRecords = 0;

        // Store unique resource types
        const resourceTypes = new Set();

        resources.forEach(resource => {
            const quantity = Number(resource.Quantity) || 0;

            const status = String(resource.Status || "")
                .trim()
                .toLowerCase();

            resourceTypes.add(resource.Resource_Type || "Other");

            // Total quantity of all resource units
            totalUnits += quantity;

            if (status === "available") {
                availableUnits += quantity;
                availableRecords++;
            } else if (status === "deployed") {
                deployedUnits += quantity;
                deployedRecords++;
            }
        });

        // ==========================================
        // UPDATE DASHBOARD STATS
        // ==========================================

        // Count resource records, not quantities
        document.getElementById("totalResources").textContent =
            resources.length;

        document.getElementById("availableResources").textContent =
            availableRecords;

        const deployedElement =
            document.getElementById("deployedResources");

        if (deployedElement) {
            deployedElement.textContent = deployedRecords;
        }

        const resourceTypesElement =
            document.getElementById("resourceTypes");

        if (resourceTypesElement) {
            resourceTypesElement.textContent = resourceTypes.size;
        }


        // ==========================================
        // EMPTY RESOURCE TABLE
        // ==========================================

        if (
            resources.length === 0
        ) {

            tableBody.innerHTML = `

                <tr>

                    <td
                        colspan="7"
                        style="text-align:center;"
                    >
                        No Resources Available
                    </td>

                </tr>

            `;


            createResourceChart({});


            return;

        }


        // ==========================================
        // DISPLAY RESOURCE TABLE
        // ==========================================

        resources.forEach(
            resource => {

                const status =
                    String(
                        resource.Status || ""
                    ).trim();


                const statusLower =
                    status.toLowerCase();


                tableBody.innerHTML += `

                    <tr>

                        <td>
                            ${resource.Resource_id}
                        </td>

                        <td>
                            ${resource.Resource_Name}
                        </td>

                        <td>
                            ${resource.Resource_Type}
                        </td>

                        <td>
                            ${resource.Quantity}
                        </td>

                        <td>
                            ${resource.Location_Name}
                        </td>

                        <td>
                            ${status}
                        </td>

                        <td>

                            <button
                                class="${statusLower === "available"
                        ? "deploy-btn"
                        : "available-btn"
                    }"
                                onclick="updateStatus(
                                    ${resource.Resource_id},
                                    '${status}'
                                )"
                            >

                                ${statusLower === "available"
                        ? "Deploy"
                        : "Mark Available"
                    }

                            </button>

                        </td>

                    </tr>

                `;

            }
        );


        // ==========================================
        // RESOURCE TYPE STATISTICS
        // ==========================================

        const typeCounts = {};


        resources.forEach(
            resource => {

                const type =
                    resource.Resource_Type ||
                    "Other";


                const quantity =
                    Number(
                        resource.Quantity
                    ) || 0;


                typeCounts[type] =
                    (typeCounts[type] || 0) +
                    quantity;

            }
        );


        // ==========================================
        // CREATE RESOURCE CHART
        // ==========================================

        createResourceChart(
            typeCounts
        );


        createResourceStatusChart(
            availableUnits,
            deployedUnits
        );


        // ==========================================
        // LOAD ASSIGNED RESOURCES
        // ==========================================

        await loadAssignments();


        // ==========================================
        // DEBUG / ANALYTICS LOG
        // ==========================================

        console.log(
            "Resource Analytics:",
            {

                totalUnits,

                availableUnits,

                deployedUnits,

                availableRecords,

                deployedRecords,

                resourceTypeCount:
                    resourceTypes.size,

                typeCounts

            }
        );


    } catch (error) {

        console.error(
            "Resources Error:",
            error
        );

    }

}


// ==========================================
// ADD RESOURCE
// ==========================================

async function addResource() {

    try {

        const resourceName =
            document
                .getElementById(
                    "resourceName"
                )
                .value
                .trim();


        const resourceType =
            document
                .getElementById(
                    "resourceType"
                )
                .value
                .trim();


        const quantity =
            Number(
                document
                    .getElementById(
                        "quantity"
                    )
                    .value
            );


        const location =
            document
                .getElementById(
                    "location"
                )
                .value
                .trim();


        const status =
            document
                .getElementById(
                    "status"
                )
                .value;


        if (
            !resourceName ||
            !resourceType ||
            !quantity ||
            !location
        ) {

            alert(
                "Please fill all resource details."
            );

            return;

        }


        const response =
            await authenticatedFetch(
                `${API_BASE}/resources`,
                {

                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({

                        resourceName,

                        resourceType,

                        quantity,

                        location,

                        status

                    })

                }
            );


        const data =
            await response.json();


        alert(
            data.message
        );


        // Clear form

        document
            .getElementById(
                "resourceName"
            )
            .value = "";


        document
            .getElementById(
                "resourceType"
            )
            .value = "";


        document
            .getElementById(
                "quantity"
            )
            .value = "";


        document
            .getElementById(
                "location"
            )
            .value = "";


        await loadResources();


    } catch (error) {

        console.error(
            "Add Resource Error:",
            error
        );


        alert(
            "Failed to add resource"
        );

    }

}


// ==========================================
// UPDATE RESOURCE STATUS
// ==========================================

async function updateStatus(
    resourceId,
    currentStatus
) {

    try {

        const newStatus =
            String(
                currentStatus
            ).toLowerCase() === "available"

                ? "Deployed"

                : "Available";


        const response =
            await authenticatedFetch(

                `${API_BASE}/resources/${resourceId}/status`,

                {

                    method: "PUT",

                    headers: {

                        "Content-Type":
                            "application/json"

                    },

                    body: JSON.stringify({

                        status:
                            newStatus

                    })

                }

            );


        const data =
            await response.json();


        alert(
            data.message
        );


        await loadResources();


    } catch (error) {

        console.error(
            "Update Status Error:",
            error
        );


        alert(
            "Failed to update status"
        );

    }

}


// ==========================================
// RESOURCE CHART
// ==========================================

let resourceChartInstance =
    null;

let resourceStatusChartInstance =
    null;


function createResourceChart(
    typeCounts
) {

    const canvas =
        document.getElementById(
            "resourceChart"
        );


    if (!canvas) {
        return;
    }


    // Destroy previous chart

    if (resourceChartInstance) {

        resourceChartInstance.destroy();

    }


    resourceChartInstance =
        new Chart(

            canvas,

            {

                type: "bar",

                data: {

                    labels:
                        Object.keys(
                            typeCounts
                        ),

                    datasets: [

                        {

                            label:
                                "Resource Quantity",

                            data:
                                Object.values(
                                    typeCounts
                                )

                        }

                    ]

                },

                options: {

                    responsive: true,

                    plugins: {

                        legend: {

                            display: false

                        }

                    },

                    scales: {

                        y: {

                            beginAtZero: true,

                            ticks: {

                                precision: 0

                            }

                        }

                    }

                }

            }

        );

}


// ==========================================
// RESOURCE STATUS CHART
// ==========================================

function createResourceStatusChart(
    availableUnits,
    deployedUnits
) {

    const canvas =
        document.getElementById(
            "resourceStatusChart"
        );


    if (!canvas) {
        return;
    }


    // Destroy previous chart

    if (
        resourceStatusChartInstance
    ) {

        resourceStatusChartInstance.destroy();

    }


    resourceStatusChartInstance =
        new Chart(

            canvas,

            {

                type: "bar",

                data: {

                    labels: [

                        "Available",

                        "Deployed"

                    ],

                    datasets: [

                        {

                            label:
                                "Resource Units",

                            data: [

                                availableUnits,

                                deployedUnits

                            ]

                        }

                    ]

                },

                options: {

                    responsive: true,

                    plugins: {

                        legend: {

                            display: false

                        }

                    },

                    scales: {

                        y: {

                            beginAtZero: true,

                            ticks: {

                                precision: 0

                            }

                        }

                    }

                }

            }

        );

}


// ==========================================
// LOAD ASSIGNED RESOURCES
// ==========================================

async function loadAssignments() {

    try {

        const response =
            await authenticatedFetch(
                `${API_BASE}/resources/assignments`
            );


        if (!response.ok) {

            throw new Error(
                "Failed to fetch assignments"
            );

        }


        const assignments =
            await response.json();


        const tableBody =
            document.getElementById(
                "assignmentsTableBody"
            );


        if (!tableBody) {
            return;
        }


        tableBody.innerHTML = "";


        // ==========================================
        // NO ASSIGNMENTS
        // ==========================================

        if (
            assignments.length === 0
        ) {

            tableBody.innerHTML = `

                <tr>

                    <td
                        colspan="7"
                        style="text-align:center;"
                    >
                        No resources assigned yet
                    </td>

                </tr>

            `;

            return;

        }


        // ==========================================
        // DISPLAY ASSIGNMENTS
        // ==========================================

        assignments.forEach(
            assignment => {

                tableBody.innerHTML += `

                    <tr>

                        <td>
                            ${assignment.Assignment_id}
                        </td>

                        <td>
                            ${assignment.Report_id}
                        </td>

                        <td>
                            ${assignment.Resource_Name}
                        </td>

                        <td>
                            ${assignment.Resource_Type}
                        </td>

                        <td>
                            ${assignment.Quantity}
                        </td>

                        <td>
                            ${assignment.Location_Name}
                        </td>

                        <td>
                            ${assignment.Status}
                        </td>

                    </tr>

                `;

            }
        );


    } catch (error) {

        console.error(
            "Load Assignments Error:",
            error
        );

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

            await loadResources();

        } catch (error) {

            console.error(
                "Authentication initialization failed:",
                error
            );

        }

    }
);