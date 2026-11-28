function openPage(page) {
    const allowedPages = [
        "location-test.html",
        "report-tracking.html",
        "ai-analysis.html",
        "weather-dashboard.html",
        "disaster-intelligence.html",
        "authority-dashboard.html"
    ];

    if (!allowedPages.includes(page)) {
        console.warn("Blocked invalid navigation target:", page);
        return;
    }

    window.location.href = page;
}