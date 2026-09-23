// console.log("report-tracking.js loaded");

// // HTML poora load hone ke baad code execute hoga
// document.addEventListener("DOMContentLoaded", () => {
//     const trackBtn = document.getElementById("trackBtn");
//     const reportResult = document.getElementById("reportResult");
//     const reportIdInput = document.getElementById("reportId");

//     console.log("Track Button Element:", trackBtn);

//     if (!trackBtn) {
//         console.error("Error: HTML me 'trackBtn' element nahi mila!");
//         return;
//     }

//     trackBtn.addEventListener("click", async () => {
//         console.log("Track button clicked");

//         const reportId = reportIdInput.value.trim();

//         if (!reportId) {
//             alert("Please enter a Report ID");
//             return;
//         }

//         reportResult.innerHTML = "<p>Fetching report details...</p>";

//         try {
//             const response = await fetch(
//                 `http://localhost:5000/api/reports/${reportId}`
//             );

//             if (!response.ok) {
//                 throw new Error(`Report not found (Status: ${response.status})`);
//             }

//             const data = await response.json();

//             console.log("Report Data:", data);

//             // Windows backslash (\) ko web forward slash (/) me convert kar rahe hain
//             const photoUrl = data.Photo_Path 
//                 ? `http://localhost:5000/${data.Photo_Path.replace(/\\/g, '/')}` 
//                 : null;

//             reportResult.innerHTML = `
//                 <h2>Report #${data.Report_id}</h2>
//                 <p><strong>Title:</strong> ${data.Title}</p>
//                 <p><strong>Description:</strong> ${data.Description}</p>
//                 <p><strong>Category:</strong> ${data.Category}</p>
//                 <p><strong>Severity:</strong> ${data.Severity}</p>
//                 <p><strong>Priority:</strong> ${data.Priority}</p>
//                 <p><strong>Status:</strong> ${data.Status}</p>
//                 <p><strong>Location:</strong> ${data.Location_Name}</p>
//                 <p><strong>Created:</strong> ${new Date(data.Created_At).toLocaleString()}</p>
//                 ${photoUrl ? `<div style="margin-top:15px;"><img src="${photoUrl}" alt="Report Photo" style="max-width: 100%; border-radius: 8px;" /></div>` : ''}
//             `;

//         } catch (error) {
//             console.error("Fetch Error:", error);

//             reportResult.innerHTML = `
//                 <p style="color: red; font-weight: bold;">Report not found or server error.</p>
//             `;
//         }
//     });
// });

console.log("report-tracking.js loaded");

// Execute code after HTML is fully loaded
document.addEventListener("DOMContentLoaded", () => {
    const trackBtn = document.getElementById("trackBtn");
    const reportResult = document.getElementById("reportResult");
    const reportIdInput = document.getElementById("reportId");

    console.log("Track Button Element:", trackBtn);

    if (!trackBtn) {
        console.error("Error: 'trackBtn' element not found in HTML!");
        return;
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

            const data = await response.json();

            console.log("Report Data:", data);

            // Extract ONLY the exact filename from Photo_Path
            let photoUrl = null;
            if (data.Photo_Path) {
                // 1. Standardize all backslashes (\) to forward slashes (/)
                const normalizedPath = data.Photo_Path.replace(/\\/g, '/');

                // 2. Extract just the filename at the end (e.g., "1789738129513-764475402.png")
                const filename = normalizedPath.split('/').pop();

                // 3. Attach directly to Express static static route
                if (filename) {
                    photoUrl = `http://localhost:5000/uploads/${filename}`;
                }
            }

            reportResult.innerHTML = `
                <h2>Report #${data.Report_id}</h2>
                <p><strong>Title:</strong> ${data.Title || "N/A"}</p>
                <p><strong>Description:</strong> ${data.Description || "N/A"}</p>
                <p><strong>Category:</strong> ${data.Category || "N/A"}</p>
                <p><strong>Severity:</strong> ${data.Severity || "N/A"}</p>
                <p><strong>Priority:</strong> ${data.Priority || "N/A"}</p>
                <p><strong>Status:</strong> ${data.Status || "N/A"}</p>
                <p><strong>Location:</strong> ${data.Location_Name || "N/A"}</p>
                <p><strong>Created:</strong> ${data.Created_At ? new Date(data.Created_At).toLocaleString() : "N/A"}</p>
                ${photoUrl ? `
                    <div style="margin-top:15px;">
                        <img src="${photoUrl}" alt="Report Photo" style="max-width: 100%; border-radius: 8px; border: 1px solid #ccc;" />
                    </div>
                ` : '<p style="margin-top:15px; color: #777;"><em>No photo attached to this report</em></p>'}
            `;

        } catch (error) {
            console.error("Fetch Error:", error);

            reportResult.innerHTML = `
                <p style="color: red; font-weight: bold;">Report not found or server error.</p>
            `;
        }
    });
});