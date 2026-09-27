// ============================================================
//  auth.js — Firebase Authentication + Backend Integration
//  Shared by all pages in Smart Attendance v2
// ============================================================

// ── Firebase Config ───────────────────────────────────────────
// Replace these values with your own Firebase project config:
// Firebase Console → Project Settings → General → Your apps → Firebase SDK snippet
const FIREBASE_CONFIG = {
    apiKey:            "YOUR_FIREBASE_API_KEY",
    authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
    projectId:         "YOUR_PROJECT_ID",
    storageBucket:     "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId:             "YOUR_APP_ID"
};

// ── Backend API base URL ──────────────────────────────────────
// Change this to your deployed backend URL in production
const API_BASE = 'http://localhost:8080';

// ── Initialize Firebase (CDN compat mode) ────────────────────
// Firebase is loaded via CDN in each HTML file

let _firebaseApp  = null;
let _firebaseAuth = null;

function getFirebaseApp() {
    if (!_firebaseApp) {
        if (typeof firebase === 'undefined') {
            console.error('Firebase SDK not loaded. Make sure you include the Firebase CDN scripts.');
            return null;
        }
        if (firebase.apps && firebase.apps.length > 0) {
            _firebaseApp = firebase.apps[0];
        } else {
            _firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
        }
    }
    return _firebaseApp;
}

function getAuth() {
    if (!_firebaseAuth) {
        const app = getFirebaseApp();
        if (!app) return null;
        _firebaseAuth = firebase.auth();
    }
    return _firebaseAuth;
}

// ── Auth Object ───────────────────────────────────────────────
const Auth = {

    // Get stored profile (cached from last API call)
    getProfile() {
        const p = localStorage.getItem('auth_profile');
        return p ? JSON.parse(p) : null;
    },

    getRole() {
        return localStorage.getItem('auth_role');
    },

    isLoggedIn() {
        return !!localStorage.getItem('auth_role');
    },

    saveProfile(role, profile) {
        localStorage.setItem('auth_role',    role);
        localStorage.setItem('auth_profile', JSON.stringify(profile));
    },

    clearLocal() {
        localStorage.removeItem('auth_role');
        localStorage.removeItem('auth_profile');
    },

    // Get current Firebase ID token (refreshes if needed)
    async getIdToken() {
        const auth = getAuth();
        if (!auth) return null;
        const user = auth.currentUser;
        if (!user) return null;
        return await user.getIdToken(/* forceRefresh */ false);
    },

    // Build headers for API calls
    async apiHeaders() {
        const token = await this.getIdToken();
        return {
            'Content-Type':  'application/json',
            'Authorization': token ? `Bearer ${token}` : '',
        };
    },

    // ── Guard: redirect to login if not authenticated ────────
    requireLogin() {
        if (!this.isLoggedIn()) {
            window.location.href = 'index.html';
            return false;
        }
        return true;
    },

    requireRole(role) {
        if (!this.isLoggedIn()) {
            window.location.href = 'index.html';
            return false;
        }
        if (this.getRole() !== role) {
            window.location.href = 'unauthorized.html';
            return false;
        }
        return true;
    },

    // ── Sign up with Firebase + register profile in backend ──
    async signUp({ role, name, email, password, ...extra }) {
        const auth = getAuth();
        if (!auth) throw new Error('Firebase not initialized.');

        // 1. Create Firebase user
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        const user = cred.user;

        // 2. Update Firebase display name
        await user.updateProfile({ displayName: name });

        // 3. Register profile in backend (Supabase)
        const idToken = await user.getIdToken();
        const res = await fetch(`${API_BASE}/api/auth/register`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
            body:    JSON.stringify({ role, name, email, firebase_uid: user.uid, ...extra }),
        });
        const data = await res.json();
        if (!data.success) {
            // Rollback: delete Firebase user if backend fails
            await user.delete();
            throw new Error(data.error || 'Registration failed.');
        }

        // 4. Force token refresh to pick up custom claims (role)
        await user.getIdToken(true);

        return data;
    },

    // ── Login with Firebase email/password ───────────────────
    async signInWithEmail(email, password) {
        const auth = getAuth();
        if (!auth) throw new Error('Firebase not initialized.');
        const cred = await auth.signInWithEmailAndPassword(email, password);
        return cred.user;
    },

    // ── Student login by PRN (teacher uses email directly) ───
    // Students registered with prn@attendance.local synthetic email
    async signInStudent(prn, password) {
        // We store students using their PRN as synthetic email prefix
        const syntheticEmail = `${prn.toLowerCase()}@attendance.local`;
        return await this.signInWithEmail(syntheticEmail, password);
    },

    // ── Fetch user profile from backend after login ──────────
    async fetchAndSaveProfile() {
        const headers = await this.apiHeaders();
        const res  = await fetch(`${API_BASE}/api/auth/me`, { headers });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Could not load profile.');
        this.saveProfile(data.role, data.profile);
        return data;
    },

    // ── Logout ───────────────────────────────────────────────
    async logout() {
        const auth = getAuth();
        try {
            if (auth) await auth.signOut();
        } catch (_) {}
        this.clearLocal();
        window.location.href = 'index.html';
    },
};

// ── Mobile Responsive Sidebar Toggle ──────────────────────────
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('visible');
}
window.toggleSidebar = toggleSidebar;

