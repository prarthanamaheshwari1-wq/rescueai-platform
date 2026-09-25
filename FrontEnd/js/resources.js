console.log("Resources Dashboard Loaded");

async function loadResources() {

    try {

        const response = await fetch(
            "http://localhost:5000/api/resources"
        );

        const resources = await response.json();

        const tableBody =
            document.getElementById("resourceTableBody");

        tableBody.innerHTML = "";

        document.getElementById("totalResources")
            .textContent = resources.length;

        const availableCount = resources.filter(
            resource =>
                (resource.Status || "").toLowerCase() === "available"
        ).length;

        document.getElementById("availableResources")
            .textContent = availableCount;

        if (resources.length === 0) {

            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center;">
                        No Resources Available
                    </td>
                </tr>
            `;

            return;
        }

        resources.forEach(resource => {

            tableBody.innerHTML += `
    <tr>
        <td>${resource.Resource_id}</td>
        <td>${resource.Resource_Name}</td>
        <td>${resource.Resource_Type}</td>
        <td>${resource.Quantity}</td>
        <td>${resource.Location_Name}</td>
        <td>${resource.Status}</td>

        <td>
    <button
        class="${resource.Status === 'Available'
                    ? 'deploy-btn'
                    : 'available-btn'
                }"
        onclick="updateStatus(
            ${resource.Resource_id},
            '${resource.Status}'
        )"
    >
        ${resource.Status === "Available"
                    ? "Deploy"
                    : "Mark Available"
                }
    </button>
</td>
    </tr>
`;

        });

        // Resource Type Statistics

        const typeCounts = {};

        resources.forEach(resource => {

            const type = resource.Resource_Type || "Other";

            typeCounts[type] =
                (typeCounts[type] || 0) + resource.Quantity;

        });

        createResourceChart(typeCounts);

    } catch (error) {

        console.error("Resources Error:", error);

    }

}

loadResources();

async function addResource() {

    try {

        const resourceName =
            document.getElementById("resourceName").value;

        const resourceType =
            document.getElementById("resourceType").value;

        const quantity =
            document.getElementById("quantity").value;

        const location =
            document.getElementById("location").value;

        const status =
            document.getElementById("status").value;

        const response = await fetch(
            "http://localhost:5000/api/resources",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
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

        const data = await response.json();

        alert(data.message);

        loadResources();

    } catch (error) {

        console.error(error);

        alert("Failed to add resource");

    }

}

async function updateStatus(resourceId, currentStatus) {

    try {

        const newStatus =
            currentStatus === "Available"
                ? "Deployed"
                : "Available";

        const response = await fetch(
            `http://localhost:5000/api/resources/${resourceId}/status`,
            {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    status: newStatus
                })
            }
        );

        const data = await response.json();

        alert(data.message);

        loadResources();

    } catch (error) {

        console.error(error);

        alert("Failed to update status");

    }

}

let resourceChartInstance = null;

function createResourceChart(typeCounts) {

    const ctx =
        document.getElementById("resourceChart");

    if (!ctx) return;

    if (resourceChartInstance) {

        resourceChartInstance.destroy();

    }

    resourceChartInstance = new Chart(ctx, {

        type: "bar",

        data: {

            labels: Object.keys(typeCounts),

            datasets: [{

                label: "Resource Quantity",

                data: Object.values(typeCounts)

            }]

        },

        options: {

            responsive: true,

            plugins: {

                legend: {

                    display: false

                }

            }

        }

    });

}