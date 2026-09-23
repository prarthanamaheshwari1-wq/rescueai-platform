console.log("location-test.js loaded successfully");

let latitude = null;
let longitude = null;

// ELEMENTS
const locationButton = document.getElementById("locationButton");
const locationStatus = document.getElementById("locationStatus");
const latitudeElement = document.getElementById("latitude");
const longitudeElement = document.getElementById("longitude");

const photoInput = document.getElementById("photo");
const photoPreview = document.getElementById("photoPreview");
const previewImage = document.getElementById("previewImage");
const photoName = document.getElementById("photoName");
const photoSize = document.getElementById("photoSize");
const removePhoto = document.getElementById("removePhoto");
const uploadArea = document.getElementById("uploadArea");

const emergencyForm = document.getElementById("emergencyForm");
const submitButton = document.getElementById("submitButton");
const result = document.getElementById("result");

// LOCATION DETECTION
locationButton.addEventListener("click", (e) => {
    e.preventDefault(); // Extra protection against button submit

    if (!navigator.geolocation) {
        locationStatus.innerText = "Geolocation is not supported by this browser.";
        return;
    }

    locationButton.disabled = true;
    locationButton.innerText = "Detecting...";
    locationStatus.innerText = "Requesting your current location...";

    navigator.geolocation.getCurrentPosition(
        (position) => {
            latitude = position.coords.latitude;
            longitude = position.coords.longitude;

            if (latitudeElement) latitudeElement.innerText = latitude ? latitude.toFixed(6) : "—";
            if (longitudeElement) longitudeElement.innerText = longitude ? longitude.toFixed(6) : "—";

            locationStatus.innerText = "Location detected successfully.";
            locationButton.innerText = "Location Detected ✓";
            locationButton.disabled = false;
        },
        (error) => {
            console.error("Location Error:", error);
            locationStatus.innerText = "Unable to detect location. Please allow access.";
            locationButton.innerText = "Try Again";
            locationButton.disabled = false;
        }
    );
});

// PHOTO SELECTION
photoInput.addEventListener("change", () => {
    const file = photoInput.files[0];
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/jpg", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
        alert("Please select a JPG, PNG or WEBP image.");
        photoInput.value = "";
        return;
    }

    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) {
        alert("Photo size must be less than 20 MB.");
        photoInput.value = "";
        return;
    }

    const reader = new FileReader();
    reader.onload = function (event) {
        previewImage.src = event.target.result;
        photoPreview.classList.remove("hidden");
        uploadArea.classList.add("hidden");
        photoName.innerText = file.name;
        photoSize.innerText = formatFileSize(file.size);
    };
    reader.readAsDataURL(file);
});

// DRAG AND DROP HANDLING
["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
    uploadArea.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
    }, false);
});

uploadArea.addEventListener("drop", (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        photoInput.files = files;
        photoInput.dispatchEvent(new Event("change"));
    }
});

// REMOVE PHOTO
removePhoto.addEventListener("click", (e) => {
    e.preventDefault();
    photoInput.value = "";
    previewImage.src = "";
    photoPreview.classList.add("hidden");
    uploadArea.classList.remove("hidden");
});

// FILE SIZE FORMAT
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + " Bytes";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

// SUBMIT EMERGENCY REPORT
emergencyForm.addEventListener("submit", async function (event) {
    // 1. Browser page refresh hone se rokein
    event.preventDefault();

    console.log("SUBMIT EVENT PREVENTED");

    if (latitude === null || longitude === null) {
        showResult("Please detect your location before submitting.", "error");
        return;
    }

    const photo = photoInput.files[0];
    console.log("PHOTO CHECK:", photo);
    if (!photo) {
        showResult("Please select an emergency photo.", "error");
        return;
    }

    submitButton.disabled = true;
    submitButton.innerText = "Submitting Report...";

    const formData = new FormData();
    console.log("FORM DATA CREATED");
    formData.append("title", document.getElementById("title").value);
    formData.append("description", document.getElementById("description").value);
    formData.append("category", document.getElementById("category").value);
    formData.append("severity", document.getElementById("severity").value);
    formData.append("locationName", document.getElementById("locationName").value);
    formData.append("latitude", latitude);
    formData.append("longitude", longitude);
    formData.append("photo", photo);

    try {
        console.log("ABOUT TO SEND REQUEST");
        const response = await fetch("http://localhost:5000/api/reports/emergency", {
            method: "POST",
            body: formData
        });

        const data = await response.json();

        console.log("Server Response:", data);

        if (response.ok) {
            showResult("Emergency report submitted successfully.", "success");
            const reportId = data.reportId;

            setTimeout(() => {
                window.location.href =
                    `report-tracking.html?reportId=${reportId}`;
            }, 2000);

            // Reset form state
            emergencyForm.reset();
            latitude = null;
            longitude = null;
            if (latitudeElement) latitudeElement.innerText = "—";
            if (longitudeElement) longitudeElement.innerText = "—";
            locationStatus.innerText = "Location has not been detected yet.";
            locationButton.innerText = "Detect Location";
            photoPreview.classList.add("hidden");
            uploadArea.classList.remove("hidden");

            // Re-enable submit button
            submitButton.disabled = false;
            submitButton.innerText = "🚨 Submit Emergency Report";
        } else {
            showResult(data.message || "Unable to submit the report.", "error");
            submitButton.disabled = false;
            submitButton.innerText = "🚨 Submit Emergency Report";
        }
    } catch (error) {
        console.error("Submission Error:", error);
        showResult("Could not connect to the RescueAI server.", "error");
        submitButton.disabled = false;
        submitButton.innerText = "🚨 Submit Emergency Report";
    }
});

// SHOW RESULT
function showResult(message, type) {
    result.innerText = message;
    result.className = "result " + type;
    result.classList.remove("hidden");
    result.scrollIntoView({ behavior: "smooth", block: "center" });
}