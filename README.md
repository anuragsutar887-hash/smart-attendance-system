# 🎓 Smart Attendance Management System

A modern, responsive, and secure college attendance portal designed for university departments. Powered by **Node.js/Express**, **Supabase (PostgreSQL)**, and **Firebase Authentication**.

---

## ✨ Features

- 🎒 **Student Portal**:
  - Live attendance tracker with overall percentage and university exam eligibility status (>= 75%).
  - Per-course attendance breakdown (Conducted, Attended, Missed, Percentage).
  - Recent lecture attendance history log.
- 👨‍🏫 **Faculty Workspace**:
  - Course and division class management (Add/Delete subjects).
  - Daily lecture attendance marking with quick "All Present" / "All Absent" toggles.
  - Class rosters with search and student directory management.
  - Department and per-subject attendance analytics.
  - One-click Excel (.CSV with UTF-8 BOM) export for official records.
- 🔐 **Real Authentication**:
  - Powered by **Firebase Authentication** (email/password).
  - Students sign in seamlessly using their PRN number.
  - Teachers sign in with their department email.
  - Role-based route protection on both frontend and backend.
- 🗄️ **Supabase Database**:
  - Cloud PostgreSQL with relational tables (`user_profiles`, `students`, `teachers`, `subjects`, `attendance`).
  - Strict foreign keys, indexes, and constraints.
- 📱 **100% Mobile Responsive**:
  - Mobile hamburger navigation drawer with backdrop overlay.
  - Adaptive grids, fluid stat cards, and horizontal scroll tables for phones, tablets, and desktops.

---

## 🏗️ Project Architecture

```
Attendance management/
├── backend/
│   ├── .env.example          # Environment variable template
│   ├── package.json          # Backend dependencies
│   ├── server.js             # Express API + Supabase client + Firebase Admin SDK
│   └── supabase-schema.sql   # Complete PostgreSQL schema & table setup
├── frontend/
│   ├── index.html            # Firebase-powered Login & Registration page
│   ├── dashboard.html        # Faculty Dashboard & Subject Cards
│   ├── student-dashboard.html# Student Portal & Attendance Analytics
│   ├── attendance.html       # Daily Attendance Marking Tool
│   ├── reports.html          # Reports & Excel Export
│   ├── students.html         # Student Directory & Record Manager
│   ├── unauthorized.html     # 403 Forbidden Access Page
│   ├── auth.js               # Shared Firebase Auth & API communication
│   ├── script.js             # Student CRUD UI handlers
│   └── style.css             # Theme & Mobile-First Responsive Styles
├── .gitignore                # Git ignore rules
├── package.json              # Root project configuration
├── README.md                 # Project documentation
└── start.bat                 # Windows one-click start script
```

---

## 🚀 Quick Setup Guide

### 1. Install Backend Dependencies
Open terminal in the project root:
```bash
cd backend
npm install
```

### 2. Set Up Supabase Database
1. Create a free project at [Supabase](https://supabase.com/).
2. Navigate to **SQL Editor** in your Supabase dashboard.
3. Open `backend/supabase-schema.sql`, copy its content, paste it into the SQL Editor, and click **Run**.
4. Go to **Project Settings** → **API** to copy your `Project URL` and `service_role` secret key.

### 3. Set Up Firebase Authentication
1. Create a project at [Firebase Console](https://console.firebase.google.com/).
2. Enable **Authentication** with the **Email/Password** sign-in provider.
3. In **Project Settings** → **General** → **Your apps**, create a Web app and copy your configuration into `frontend/auth.js`:
   ```javascript
   const FIREBASE_CONFIG = {
       apiKey: "AIza...",
       authDomain: "your-project.firebaseapp.com",
       projectId: "your-project",
       storageBucket: "your-project.appspot.com",
       messagingSenderId: "...",
       appId: "..."
   };
   ```
4. In **Project Settings** → **Service accounts**, generate a new private key and copy the credentials into `backend/.env`.

### 4. Configure Backend Environment
Copy `backend/.env.example` to `backend/.env`:
```bash
cp backend/.env.example backend/.env
```
Fill in your Supabase and Firebase keys:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

PORT=8080
```

### 5. Start the Server
Run:
```bash
npm start
```
or on Windows, simply double-click `start.bat`.

Then open `frontend/index.html` in your web browser!

---

## 📄 License
This project is open-source under the [MIT License](LICENSE).
