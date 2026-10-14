(function () {

    // ==========================================
    // PUBLIC PAGES
    // ==========================================


    const publicPages = [
        "",
        "permission.html",
        "authority-login.html",
        "public.html",
        "index.html",
        "location-test.html",
        "report.html",
        "report-tracking.html",
        "weather.html",
        "weather-dashboard.html"
    ];


    const currentPage =
        window.location.pathname
            .split("/")
            .pop()
            .toLowerCase();


    // ==========================================
    // PUBLIC PAGE → ALLOW IMMEDIATELY
    // ==========================================

    if (publicPages.includes(currentPage)) {
        window.RescueAIAuthReady = Promise.resolve();
        return;
    }


    // ==========================================
    // API BASE
    // ==========================================

    // Automatically matches whatever hostname the user uses (localhost or 127.0.0.1)
    const API_BASE = `${window.location.protocol}//${window.location.hostname}:5000/api`;


    // ==========================================
    // CHECK AUTHENTICATION
    // ==========================================

    async function checkAuthentication() {

        try {


            const response = await fetch(`${API_BASE}/auth/refresh`, {
                method: "POST",
                credentials: "include"
            });

            const data = await response.json().catch(() => ({}));

            // ==========================================
            // AUTHENTICATED
            // ==========================================

            // ==========================================
            // AUTHENTICATED & ROLE VALIDATION
            // ==========================================

            if (response.ok && data.accessToken) {

                // Check role restriction for authority pages

                const allowedRoles = ["authority"];
                const userRole = String(data.user?.role || "").trim().toLowerCase();

                const isAuthority = allowedRoles.includes(userRole);

                const isVolunteerAllowed =
                    userRole === "volunteer" &&
                    currentPage === "ai-analysis.html";

                if (!isAuthority && !isVolunteerAllowed) {
                    window.location.replace("authority-login.html");
                    return;
                }

                window.RescueAIAccessToken = data.accessToken;
                window.RescueAIUser = data.user;

                return data.accessToken;
            }

            // ==========================================
            // NOT AUTHENTICATED
            // ==========================================

            // Avoid saving infinite redirection loops into sessionStorage
            if (
                !currentPage.includes("login") &&
                !currentPage.includes("register") &&
                !currentPage.includes("permission")
            ) {
                sessionStorage.setItem(
                    "rescueAI_requested_page",
                    currentPage + window.location.search + window.location.hash
                );
            }

            window.location.replace("authority-login.html");

        } catch (error) {

            console.error("Authentication check failed.");

            if (
                !currentPage.includes("login") &&
                !currentPage.includes("register") &&
                !currentPage.includes("permission")
            ) {
                sessionStorage.setItem(
                    "rescueAI_requested_page",
                    currentPage + window.location.search + window.location.hash
                );
            }

            window.location.replace("authority-login.html");

        }

    }


    // ==========================================
    // START AUTHENTICATION CHECK
    // ==========================================

    const authPromise = checkAuthentication();
    window.RescueAIAuthReady = authPromise;

    window.ensureAuthenticated = async function () {
        await authPromise;
        return window.RescueAIAccessToken;
    };

})();