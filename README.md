# 🚨 RescueAI — AI-Powered Disaster Response Platform

RescueAI is an intelligent disaster-response platform designed to support emergency reporting, disaster information management, resource coordination, and response operations.

The platform combines web technologies with AI-assisted analysis to help organize emergency information and improve coordination between citizens, volunteers, and authorities.

## 🌟 Key Features

### 🆘 Emergency Reporting
- Submit emergency and disaster-related reports.
- Provide incident details and location information.
- Attach photographs captured through the camera.
- Track submitted reports and their status.

### 🤖 AI-Assisted Report Analysis
- Analyze emergency reports using AI.
- Assist with incident severity and priority assessment.
- Support report review through structured analysis.

### 🛡️ Report Verification and Misuse Prevention
- Support source and image verification checks.
- Detect potentially duplicate reports or images.
- Perform location and incident consistency checks.
- Include mechanisms to help identify suspicious or misleading submissions.

### 🌍 Disaster Intelligence
- Display disaster-related information and events.
- Provide disaster intelligence through a dedicated dashboard.
- Help users access relevant emergency information.

### 👥 Volunteer and Resource Coordination
- Support volunteer-related information and coordination.
- Manage emergency resources through dedicated interfaces.
- Assist authorities with response-related organization.

### 🔐 Authentication and Role-Based Access
- User authentication and protected access.
- Role-based permissions for different platform users.
- Separate interfaces for citizens, volunteers, and authorities.

## 🛠️ Technology Stack

### Frontend
- HTML5
- CSS3
- JavaScript

### Backend
- Node.js
- Express.js

### Database and Supporting Services
- Microsoft SQL Server
- Redis

### AI and Image Processing
- Google Gemini API
- Hugging Face Transformers
- Sharp

## 📁 Project Structure

```text
rescueai-platform/
│
├── FrontEnd/
│   ├── assets/
│   │   ├── css/
│   │   └── js/
│   └── *.html
│
├── BackEnd/
│   ├── config/
│   ├── middleware/
│   ├── routes/
│   ├── tests/
│   └── package.json
│
├── Database/
│
└── README.md
```

## ⚙️ Getting Started

### Prerequisites

Install the following before running the project:

- Node.js
- npm
- Microsoft SQL Server
- Redis

### 1. Clone the Repository

```bash
git clone https://github.com/prarthanamaheshwari1-wq/rescueai-platform.git
cd rescueai-platform
```

### 2. Install Backend Dependencies

```bash
cd BackEnd
npm install
```

### 3. Configure Environment Variables

Create a `.env` file inside the `BackEnd` directory.

Configure the required database, Redis, authentication, and AI API settings according to your local environment.

**Do not commit your `.env` file or expose API keys and credentials.**

### 4. Start the Backend

```bash
npm start
```

The backend API uses port **5000** in the local development configuration.

### 5. Run the Frontend

Open the frontend through a local development server.

The frontend communicates with the backend API on port 5000.

## 🧪 Testing

Backend tests can be executed using:

```bash
cd BackEnd
npm test
```

Frontend JavaScript syntax can be checked using:

```bash
cd FrontEnd
Get-ChildItem -Path . -Filter *.js -Recurse |
    ForEach-Object { node --check $_.FullName }
```

## 🔒 Security

RescueAI includes security-focused implementation and review covering:

- Authentication and authorization
- Role-based access control
- Input validation
- Safer dynamic HTML rendering
- URL and image-source validation
- Protected API operations
- Frontend security checks

## 🎯 Project Objective

The objective of RescueAI is to create a technology-assisted disaster-response environment where emergency information can be reported, analyzed, tracked, and coordinated more effectively.

The project focuses on improving the organization of disaster-related information and supporting collaboration among citizens, volunteers, and authorities.

## 👩‍💻 Developer

**Prarthana Maheshwari**

B.Tech Computer Science and Engineering

GitHub: [prarthanamaheshwari1-wq](https://github.com/prarthanamaheshwari1-wq)

## 📌 Project Status

RescueAI is in its final development and validation phase. Core implementation is complete, with final integration, regression testing, and deployment validation remaining.
