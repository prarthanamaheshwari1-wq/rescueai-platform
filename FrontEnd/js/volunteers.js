console.log("Volunteer Dashboard Loaded");


// ==========================================
// Load Volunteers
// ==========================================

async function loadVolunteers() {

    try {

        const response =
            await fetch(
                "http://localhost:5000/api/volunteers"
            );

        const volunteers =
            await response.json();


        document.getElementById(
            "totalVolunteers"
        ).textContent = volunteers.length;


        document.getElementById(
            "availableVolunteers"
        ).textContent =
            volunteers.filter(
                v =>
                    String(v.Availability)
                        .trim()
                        .toLowerCase() === "available"
            ).length;


        document.getElementById(
            "busyVolunteers"
        ).textContent =
            volunteers.filter(
                v =>
                    String(v.Availability)
                        .trim()
                        .toLowerCase() === "busy"
            ).length;


        const container =
            document.getElementById(
                "volunteerContainer"
            );


        container.innerHTML = "";


        volunteers.forEach(volunteer => {

            container.innerHTML += `
                <div class="volunteer-card">

                    <h2>${volunteer.Full_Name}</h2>

                    <p>
                        <strong>Skill:</strong>
                        ${volunteer.Skills || "N/A"}
                    </p>

                    <p>
                        <strong>Email:</strong>
                        ${volunteer.Email || "N/A"}
                    </p>

                    <p>
                        <strong>Phone:</strong>
                        ${volunteer.Phone_No || "N/A"}
                    </p>

                    <p>
                        <strong>Location:</strong>
                        ${volunteer.Location_Name || "N/A"}
                    </p>

                    <p>
                        <strong>Status:</strong>
                        ${volunteer.Availability || "N/A"}
                    </p>

                </div>
            `;

        });


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
                    await fetch(
                        "http://localhost:5000/api/volunteers",
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


// Load volunteers when page opens

loadVolunteers();