async function loadDisasterEvents() {
    const tableBody = document.getElementById("disasterTableBody");

    try {
        const response = await fetch("http://localhost:5000/api/disasters");

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const disasters = await response.json();

        // Update Summary Card Counters
        const totalCount = disasters.length;
        const activeCount = disasters.filter(
            d => (d.Status || d.status || "").toLowerCase() === "active"
        ).length;

        document.getElementById("totalAlerts").textContent = totalCount;
        document.getElementById("activeAlerts").textContent = activeCount;

        // If no records in database
        if (disasters.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="no-data">
                        <i class="fa-solid fa-circle-check"></i>
                        <p>No disaster alerts found in the system.</p>
                    </td>
                </tr>
            `;
            return;
        }

        // Helper: Icons for Disaster Types
        const getDisasterIcon = (type = "") => {
            const lowerType = type.toLowerCase();
            if (lowerType.includes("flood") || lowerType.includes("rain")) return '<i class="fa-solid fa-cloud-showers-heavy"></i>';
            if (lowerType.includes("storm") || lowerType.includes("wind")) return '<i class="fa-solid fa-bolt"></i>';
            if (lowerType.includes("heat") || lowerType.includes("fire")) return '<i class="fa-solid fa-fire"></i>';
            if (lowerType.includes("quake")) return '<i class="fa-solid fa-house-crack"></i>';
            return '<i class="fa-solid fa-triangle-exclamation"></i>';
        };

        // Helper: Format Date strings
        const formatDate = (dateStr) => {
            if (!dateStr) return "N/A";
            const date = new Date(dateStr);
            return isNaN(date.getTime()) ? "N/A" : date.toLocaleString(undefined, {
                dateStyle: "short",
                timeStyle: "short"
            });
        };

        // Render Table Rows
        const rowsHtml = disasters.map(disaster => {
            const statusStr = (disaster.Status || disaster.status || "Inactive").trim();
            const statusLower = statusStr.toLowerCase();

            let badgeClass = "badge-inactive";
            if (statusLower === "active") badgeClass = "badge-active";
            if (statusLower === "resolved") badgeClass = "badge-resolved";

            const disasterType = disaster.Disaster_Type || disaster.disaster_type || "General";
            const icon = getDisasterIcon(disasterType);

            return `
                <tr>
                    <td><strong>#${disaster.Disaster_id || disaster.Disaster_ID || "N/A"}</strong></td>
                    <td class="disaster-type">${icon} ${disasterType}</td>
                    <td><strong>${disaster.Disaster_Name || disaster.disaster_name || "Untitled Alert"}</strong></td>
                    <td>${disaster.Description || disaster.description || "No description provided."}</td>
                    <td>${formatDate(disaster.Start_Date || disaster.start_date)}</td>
                    <td>${formatDate(disaster.End_Date || disaster.end_date)}</td>
                    <td>
                        <span class="badge ${badgeClass}">
                            ${statusStr}
                        </span>
                    </td>
                </tr>
            `;
        }).join("");

        tableBody.innerHTML = rowsHtml;

    } catch (error) {
        console.error("Disaster Events Error:", error);

        document.getElementById("totalAlerts").textContent = "0";
        document.getElementById("activeAlerts").textContent = "0";

        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="no-data" style="color: #ef4444;">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <p>Failed to load disaster alerts. Please check backend API connection.</p>
                </td>
            </tr>
        `;
    }
}

// Initial Load
document.addEventListener("DOMContentLoaded", loadDisasterEvents);