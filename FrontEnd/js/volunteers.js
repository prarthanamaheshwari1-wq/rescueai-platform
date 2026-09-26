console.log("Volunteer Dashboard Loaded");

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
                v => v.Availability === "Available"
            ).length;

        document.getElementById(
            "busyVolunteers"
        ).textContent =
            volunteers.filter(
                v => v.Availability === "Busy"
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
                        ${volunteer.Skills}
                    </p>

                    <p>
                        <strong>Email:</strong>
                        ${volunteer.Email}
                    </p>

                    <p>
                        <strong>Phone:</strong>
                        ${volunteer.Phone_No}
                    </p>

                    <p>
                        <strong>Location:</strong>
                        ${volunteer.Location_Name}
                    </p>

                    <p>
                        <strong>Status:</strong>
                        ${volunteer.Availability}
                    </p>

                </div>
            `;
        });

    } catch(error) {

        console.error(error);

    }
}

loadVolunteers();