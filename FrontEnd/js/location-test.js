console.log("location-test.js loaded successfully");

window.addEventListener("beforeunload", function () {
    console.trace("PAGE UNLOAD TRIGGERED");
});

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


async function getLocationNameFromCoordinates(lat, lon) {
    const url = new URL(
        "https://nominatim.openstreetmap.org/reverse"
    );

    url.search = new URLSearchParams({
        format: "jsonv2",
        lat: String(lat),
        lon: String(lon),
        zoom: "18",
        addressdetails: "1"
    }).toString();

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(
            `Reverse geocoding failed: ${response.status}`
        );
    }

    const data = await response.json();

    if (!data.display_name) {
        throw new Error("No location name was returned.");
    }

    return data.display_name;
}


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

            const locationNameInput =
                document.getElementById("locationName");

            locationStatus.textContent =
                "Coordinates detected. Finding location name...";

            getLocationNameFromCoordinates(latitude, longitude)
                .then((name) => {
                    locationNameInput.value = name;

                    locationStatus.textContent =
                        "Location found. Please verify the location name.";
                })
                .catch((error) => {
                    console.error("Reverse geocoding error:", error);

                    locationStatus.textContent =
                        "Coordinates detected, but the location name could not be found. Please enter it manually.";
                });

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


// CAMERA-ONLY PHOTO CAPTURE

const startCameraButton = document.getElementById("startCamera");
const cameraPanel = document.getElementById("cameraPanel");
const cameraVideo = document.getElementById("cameraVideo");
const capturePhotoButton = document.getElementById("capturePhoto");
const cancelCameraButton = document.getElementById("cancelCamera");

let cameraStream = null;

async function startCamera() {
    try {
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error("Camera access is unavailable.");
        }

        startCameraButton.disabled = true;
        startCameraButton.textContent = "Opening Camera...";

        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } },
            audio: false
        });

        cameraVideo.srcObject = cameraStream;
        await cameraVideo.play();

        cameraPanel.classList.remove("hidden");
        uploadArea.classList.add("hidden");

    } catch (error) {
        console.error("Camera Error:", error);

        alert(
            error.name === "NotAllowedError"
                ? "Camera permission was denied. Allow camera access in your browser settings and try again."
                : "Unable to open the camera. Use localhost or HTTPS and check camera availability."
        );

        stopCamera();

    } finally {
        startCameraButton.disabled = false;
        startCameraButton.textContent = "Open Camera";
    }
}

function stopCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }

    cameraVideo.srcObject = null;
    cameraPanel.classList.add("hidden");
}

startCameraButton.addEventListener("click", startCamera);

capturePhotoButton.addEventListener("click", async () => {
    if (
        !cameraStream ||
        !cameraVideo.videoWidth ||
        !cameraVideo.videoHeight
    ) {
        alert("The camera is not ready. Please try again.");
        return;
    }

    capturePhotoButton.disabled = true;

    try {
        const canvas = document.createElement("canvas");
        canvas.width = cameraVideo.videoWidth;
        canvas.height = cameraVideo.videoHeight;

        const context = canvas.getContext("2d");

        if (!context) {
            throw new Error("Unable to process the camera image.");
        }

        context.drawImage(
            cameraVideo,
            0,
            0,
            canvas.width,
            canvas.height
        );

        const blob = await new Promise((resolve, reject) => {
            canvas.toBlob(
                image => image
                    ? resolve(image)
                    : reject(new Error("Photo capture failed.")),
                "image/jpeg",
                0.90
            );
        });

        const maxSize = 20 * 1024 * 1024;

        if (blob.size > maxSize) {
            alert("Photo size must be less than 20 MB.");
            return;
        }

        const capturedFile = new File(
            [blob],
            `emergency-${Date.now()}.jpg`,
            { type: "image/jpeg" }
        );

        const transfer = new DataTransfer();
        transfer.items.add(capturedFile);
        photoInput.files = transfer.files;

        if (previewImage.src.startsWith("blob:")) {
            URL.revokeObjectURL(previewImage.src);
        }

        previewImage.src = URL.createObjectURL(capturedFile);
        photoName.textContent = capturedFile.name;
        photoSize.textContent = formatFileSize(capturedFile.size);

        photoPreview.classList.remove("hidden");
        uploadArea.classList.add("hidden");

        stopCamera();

    } catch (error) {
        console.error("Photo Capture Error:", error);
        alert("Unable to capture the photo. Please try again.");

    } finally {
        capturePhotoButton.disabled = false;
    }
});

cancelCameraButton.addEventListener("click", () => {
    stopCamera();
    uploadArea.classList.remove("hidden");
});

window.addEventListener("beforeunload", stopCamera);


// REMOVE PHOTO
removePhoto.addEventListener("click", (e) => {
    e.preventDefault();

    photoInput.value = "";

    if (previewImage.src.startsWith("blob:")) {
        URL.revokeObjectURL(previewImage.src);
    }

    previewImage.src = "";
    photoName.textContent = "Photo selected";
    photoSize.textContent = "";

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
    formData.append("locationName", document.getElementById("locationName").value);
    formData.append("latitude", latitude);
    formData.append("longitude", longitude);
    formData.append("photo", photo);

    const API_BASE = `${window.location.protocol}//${window.location.hostname}:5000/api`;

    try {
        console.log("ABOUT TO SEND REQUEST TO:", `${API_BASE}/reports/emergency`);
        const response = await fetch(`${API_BASE}/reports/emergency`, {
            method: "POST",
            body: formData
        });

        console.log("FETCH COMPLETED", response.status);

        console.log("RESPONSE RECEIVED; parsing JSON");

        const data = await response.json();

        console.log("Server Response:", data);

        if (response.ok) {
            const consistencyWarnings =
                data.incidentConsistency?.warnings || [];

            if (consistencyWarnings.length > 0) {
                const warningMessages = consistencyWarnings
                    .map(warning => warning.message)
                    .join("\n");

                showResult(
                    "Emergency report submitted successfully, but authority review is recommended.\n\n" +
                    warningMessages,
                    "error"
                );
            } else {
                showResult(
                    "Emergency report submitted successfully. No basic consistency warnings were found.",
                    "success"
                );
            }

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