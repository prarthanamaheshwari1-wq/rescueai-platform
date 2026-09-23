console.log("Disaster Intelligence Loaded");

async function loadEvents(){

    try{

        const response = await fetch(
            "http://localhost:5000/api/disasters"
        );

        const events = await response.json();

        const container =
            document.getElementById("eventsContainer");

        container.innerHTML = "";

        events.forEach(event => {

            container.innerHTML += `
                <div class="event-card">

                    <h3>${event.Disaster_Name}</h3>

                    <p>
                        <strong>Type:</strong>
                        ${event.Disaster_Type}
                    </p>

                    <p>
                        <strong>Description:</strong>
                        ${event.Description}
                    </p>

                    <p>
                        <strong>Status:</strong>
                        ${event.Status}
                    </p>

                </div>
            `;
        });

    }catch(error){

        console.error(error);

    }

}

loadEvents();