
document.addEventListener("DOMContentLoaded", () => {

    const loginForm = document.getElementById("loginForm");
    const errorMessage = document.getElementById("errorMessage");

    if (!loginForm) {
        console.error("Login form not found.");
        return;
    }

    const submitButton =
        loginForm.querySelector('button[type="submit"]');

    // Automatically matches whatever hostname the user uses (localhost or 127.0.0.1)
    const API_BASE = `${window.location.protocol}//${window.location.hostname}:5000/api`;

    function setLoading(loading) {
        if (!submitButton) return;

        submitButton.disabled = loading;
        submitButton.textContent =
            loading ? "Signing in..." : "Login & Continue";
    }

    loginForm.addEventListener("submit", async (event) => {

        event.preventDefault();

        if (errorMessage) {
            errorMessage.textContent = "";
        }

        const email =
            document.getElementById("email").value.trim();

        const password =
            document.getElementById("password").value;

        if (!email || !password) {

            if (errorMessage) {
                errorMessage.textContent =
                    "Please enter email and password.";
            }

            return;
        }

        setLoading(true);

        try {

            // ==========================================
            // LOGIN REQUEST
            // ==========================================

            const response = await fetch(
                `${API_BASE}/auth/login`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json"
                    },

                    // Allows the browser to receive/store
                    // the HttpOnly refresh-token cookie.
                    credentials: "include",

                    body: JSON.stringify({
                        email,
                        password
                    })
                }
            );


            const data =
                await response.json().catch(() => ({}));

            // ==========================================
            // LOGIN FAILED
            // ==========================================

            if (!response.ok) {

                if (errorMessage) {
                    errorMessage.textContent =
                        data.message ||
                        "Invalid email or password.";
                }

                return;
            }


            // ==========================================
            // VALIDATE SERVER RESPONSE & ROLE
            // ==========================================

            if (!data.accessToken || !data.user) {
                if (errorMessage) {
                    errorMessage.textContent = "Invalid response from server.";
                }
                return;
            }

            // Role Protection: Ensure only authority accounts proceed to authority dashboard
            const userRole = String(data.user.role || "").trim().toLowerCase();

            const allowedRoles = ["authority", "admin", "volunteer"];

            if (!allowedRoles.includes(userRole)) {
                if (errorMessage) {
                    errorMessage.textContent =
                        "Access Denied: This account is not permitted to log in.";
                }
                return;
            }


            // ==========================================
            // STORE ACCESS TOKEN IN MEMORY ONLY
            // ==========================================

            window.RescueAIAccessToken =
                data.accessToken;


            // ==========================================
            // USER INFORMATION
            // ==========================================
            //
            // We intentionally DO NOT store the user
            // object in localStorage/sessionStorage.
            //
            // The server will be the source of truth
            // for authenticated user information.
            //
            // ==========================================


            // ==========================================
            // SAFE RETURN / REDIRECT LOGIC
            // ==========================================

            const urlParams = new URLSearchParams(window.location.search);
            const queryPage = urlParams.get("page");
            const storedPage = sessionStorage.getItem("rescueAI_requested_page");

            // Clean session storage so it doesn't pollute future logins
            sessionStorage.removeItem("rescueAI_requested_page");

            let targetPage = "index.html";

            const candidatePage = queryPage || storedPage;

            if (candidatePage) {
                const lowerCandidate = candidatePage.toLowerCase();
                // Block loop targets (login, register, permission error pages)
                if (
                    !lowerCandidate.includes("login") &&
                    !lowerCandidate.includes("register") &&
                    !lowerCandidate.includes("permission")
                ) {
                    targetPage = candidatePage;
                }
            }
            // Force clean navigation
            window.location.replace(targetPage);


        } catch (error) {
            console.error("Login request failed.");
            if (errorMessage) {
                errorMessage.textContent =
                    "Unable to connect to RescueAI server.";
            }

        } finally {

            setLoading(false);

        }

    });

});
