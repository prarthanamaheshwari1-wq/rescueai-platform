async function loadWeather() {

    try {

        const response = await fetch(
            "http://localhost:5000/api/weather?city=Delhi"
        );

        const data = await response.json();

        document.getElementById("city").textContent =
            data.city;

        document.getElementById("temperature").textContent =
            data.temperature + " °C";

        document.getElementById("humidity").textContent =
            data.humidity + " %";

        document.getElementById("windSpeed").textContent =
            data.windSpeed + " m/s";

        document.getElementById("condition").textContent =
            data.condition;

        document.getElementById("riskLevel").textContent =
            data.riskLevel;

        document.getElementById("disasterType").textContent =
            data.disasterType;

    } catch (error) {

        console.error(error);

    }
}

loadWeather();