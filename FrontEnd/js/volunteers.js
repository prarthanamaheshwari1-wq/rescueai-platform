console.log("Volunteer Dashboard Loaded");


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
// Load Volunteers
// ==========================================

async function loadVolunteers() {

    try {

        const response =
            await authenticatedFetch(
                `${API_BASE}/volunteers`
            );


        if (!response.ok) {

            throw new Error(
                `Failed to fetch volunteers. Status: ${response.status}`
            );

        }


        const volunteers =
            await response.json();


        document.getElementById(
            "totalVolunteers"
        ).textContent =
            volunteers.length;


        document.getElementById(
            "availableVolunteers"
        ).textContent =
            volunteers.filter(
                v =>
                    String(
                        v.Availability
                    )
                        .trim()
                        .toLowerCase() ===
                    "available"
            ).length;


        document.getElementById(
            "busyVolunteers"
        ).textContent =
            volunteers.filter(
                v =>
                    String(
                        v.Availability
                    )
                        .trim()
                        .toLowerCase() ===
                    "busy"
            ).length;


        const container =
            document.getElementById(
                "volunteerContainer"
            );


        container.innerHTML = "";


        volunteers.forEach(
            volunteer => {

                container.innerHTML += `

                    <div class="volunteer-card">

                        <h2>
                            ${volunteer.Full_Name}
                        </h2>


                        <p>

                            <strong>
                                Skill:
                            </strong>

                            ${volunteer.Skills ||
                    "N/A"
                    }

                        </p>


                        <p>

                            <strong>
                                Email:
                            </strong>

                            ${volunteer.Email ||
                    "N/A"
                    }

                        </p>


                        
                        <p>
                            <strong>Role:</strong>
                            ${volunteer.Role ||
                                "N/A"
                            }
                        </p>



                        <p>

                            <strong>
                                Phone:
                            </strong>

                            ${volunteer.Phone_No ||
                    "N/A"
                    }

                        </p>


                        <p>

                            <strong>
                                Location:
                            </strong>

                            ${volunteer.Location_Name ||
                    "N/A"
                    }

                        </p>


                        <p>

                            <strong>
                                Status:
                            </strong>

                            ${volunteer.Availability ||
                    "N/A"
                    }

                        </p>

                    </div>

                `;

            }
        );


    } catch (error) {

        console.error(
            "Load Volunteers Error:",
            error
        );

    }

}


// ==========================================
// Add Volunteer
// ==========================================

const volunteerForm =
    document.getElementById(
        "volunteerForm"
    );


if (volunteerForm) {

    volunteerForm.addEventListener(
        "submit",
        async function (event) {

            event.preventDefault();


            const fullName =
                document.getElementById(
                    "fullName"
                ).value.trim();


            const email =
                document.getElementById(
                    "email"
                ).value.trim();


            const password =
                document.getElementById(
                    "password"
                ).value;

            const role =
                document.getElementById(
                    "role"
                ).value;


            const phoneNo =
                document.getElementById(
                    "phoneNo"
                ).value.trim();


            const skills =
                document.getElementById(
                    "skills"
                ).value.trim();


            const locationName =
                document.getElementById(
                    "locationName"
                ).value.trim();


            try {

                const response =
                    await authenticatedFetch(
                        `${API_BASE}/volunteers`,
                        {

                            method: "POST",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body: JSON.stringify({

                                fullName:
                                    fullName,

                                email:
                                    email,

                                password:
                                    password,

                                phoneNo:
                                    phoneNo,

                                role:
                                    role,

                                skills:
                                    skills,

                                locationName:
                                    locationName

                            })

                        }
                    );


                const data =
                    await response.json();


                if (!response.ok) {

                    alert(
                        data.message ||
                        "Unable to add volunteer."
                    );

                    return;

                }


                alert(
                    data.message ||
                    "Volunteer added successfully."
                );


                volunteerForm.reset();


                await loadVolunteers();


            } catch (error) {

                console.error(
                    "Add Volunteer Error:",
                    error
                );


                alert(
                    "Unable to connect to the backend."
                );

            }

        }
    );

}


// ==========================================
// INITIAL LOAD
// ==========================================

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        try {

            await window.RescueAIAuthReady;

            await loadVolunteers();

        } catch (error) {

            console.error(
                "Authentication initialization failed:",
                error
            );

        }

    }
);