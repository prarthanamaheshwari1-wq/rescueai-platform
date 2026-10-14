// Automatically matches whatever hostname the client uses (localhost or 127.0.0.1)
const API_BASE =
    `${window.location.protocol}//${window.location.hostname}:5000/api`;


// ==========================================
// LOAD WEATHER
// ==========================================

async function loadWeather(
    city = "Delhi"
) {

    try {

        const response =
            await fetch(
                `${API_BASE}/weather?city=${encodeURIComponent(city)}`
            );


        if (!response.ok) {

            throw new Error(
                `Weather request failed. Status: ${response.status}`
            );

        }


        const data =
            await response.json();


        document.getElementById(
            "city"
        ).textContent =
            data.city;


        document.getElementById(
            "temperature"
        ).textContent =
            data.temperature + " °C";


        document.getElementById(
            "humidity"
        ).textContent =
            data.humidity + " %";


        document.getElementById(
            "windSpeed"
        ).textContent =
            data.windSpeed + " m/s";


        document.getElementById(
            "condition"
        ).textContent =
            data.condition;


        document.getElementById(
            "riskLevel"
        ).textContent =
            data.riskLevel;


        document.getElementById(
            "disasterType"
        ).textContent =
            data.disasterType;


    } catch (error) {

        console.error(
            "Weather Error:",
            error
        );


        alert(
            "City not found"
        );

    }

}


// ==========================================
// SEARCH WEATHER
// ==========================================

function searchWeather() {

    const city =
        document.getElementById(
            "cityInput"
        ).value;


    if (
        city.trim() !== ""
    ) {

        loadWeather(city);

    }

}


// ==========================================
// INITIAL LOAD
// ==========================================

loadWeather();