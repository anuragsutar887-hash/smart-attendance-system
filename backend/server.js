// ============================================================
//  Smart Attendance Management System — Node.js Backend v2
//  Express + Supabase (PostgreSQL) + Firebase Admin Auth
// ============================================================

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express          = require('express');
const cors             = require('cors');
const { createClient } = require('@supabase/supabase-js');
const admin            = require('firebase-admin');

const app  = express();
const PORT = process.env.PORT || 8080;

// ── Middleware ────────────────────────────────────────────────
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// ── Supabase Client ───────────────────────────────────────────
let supabase = null;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (supabaseUrl && supabaseKey && !supabaseUrl.includes('YOUR_PROJECT_ID')) {
    try {
        supabase = createClient(supabaseUrl, supabaseKey, {
            auth: { autoRefreshToken: false, persistSession: false }
        });
        console.log('✅ Supabase client initialized:', supabaseUrl);
    } catch (err) {
        console.warn('⚠️ Could not initialize Supabase:', err.message);
    }
} else {
    console.warn('⚠️ Supabase credentials not configured in .env. Database operations will return setup instructions.');
}

// ── Firebase Admin Init ───────────────────────────────────────
let firebaseInitialized = false;
const fbProjectId = process.env.FIREBASE_PROJECT_ID;
const fbClientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const fbPrivateKey = process.env.FIREBASE_PRIVATE_KEY;

if (fbProjectId && fbClientEmail && fbPrivateKey && !fbProjectId.includes('YOUR_FIREBASE')) {
    try {
        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId:   fbProjectId,
                    clientEmail: fbClientEmail,
                    privateKey:  fbPrivateKey.replace(/\\n/g, '\n'),
                }),
            });
        }
        firebaseInitialized = true;
        console.log('✅ Firebase Admin initialized for project:', fbProjectId);
    } catch (err) {
        console.warn('⚠️ Could not initialize Firebase Admin:', err.message);
    }
} else {
    console.warn('⚠️ Firebase Admin credentials not configured in .env. Authentication will return setup instructions.');
}

// ── Helpers ───────────────────────────────────────────────────
function success(res, data, status = 200) {
    res.status(status).json({ success: true, ...data });
}

function fail(res, error, status = 400) {
    res.status(status).json({ success: false, error });
}

function checkServices(res) {
    if (!supabase) {
        fail(res, 'Supabase database is not configured. Please add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to backend/.env', 503);
        return false;
    }
    return true;
}

/**
 * Middleware: Verify Firebase ID token from Authorization header.
 * Attaches req.firebaseUser = { uid, email, role }
 */
async function verifyFirebaseToken(req, res, next) {
    const authHeader = req.headers['authorization'] || '';
    if (!authHeader.startsWith('Bearer ')) {
        return fail(res, 'Authentication required. Please log in.', 401);
    }
    const idToken = authHeader.slice(7);

    if (!firebaseInitialized) {
        return fail(res, 'Firebase authentication is not yet configured in backend/.env', 503);
    }

    try {
        const decoded = await admin.auth().verifyIdToken(idToken);
        req.firebaseUser = {
            uid:   decoded.uid,
            email: decoded.email,
            role:  decoded.role || null,
        };
        next();
    } catch (err) {
        return fail(res, 'Invalid or expired authentication session. Please log in again.', 401);
    }
}

/**
 * Middleware: Require a specific role ('student' or 'teacher').
 */
function requireRole(role) {
    return async (req, res, next) => {
        await verifyFirebaseToken(req, res, async () => {
            if (!checkServices(res)) return;

            try {
                const { data: profile, error } = await supabase
                    .from('user_profiles')
                    .select('role')
                    .eq('firebase_uid', req.firebaseUser.uid)
                    .single();

                if (error || !profile) {
                    return fail(res, 'User profile not found in database.', 404);
                }

                if (profile.role !== role) {
                    return fail(res, `Access forbidden. ${role.charAt(0).toUpperCase() + role.slice(1)} accounts only.`, 403);
                }

                req.userRole = role;
                next();
            } catch (err) {
                return fail(res, 'Authorization check failed: ' + err.message, 500);
            }
        });
    };
}

// ============================================================
//  AUTH ROUTES
// ============================================================

/**
 * POST /api/auth/register
 * Links a newly registered Firebase user with their Supabase profile.
 */
app.post('/api/auth/register', verifyFirebaseToken, async (req, res) => {
    if (!checkServices(res)) return;

    const { role, name, email } = req.body || {};
    const firebase_uid = req.firebaseUser.uid;

    if (!role || !['student', 'teacher'].includes(role)) {
        return fail(res, 'role must be student or teacher.');
    }
    if (!name) return fail(res, 'Full name is required.');

    try {
        // 1. Upsert profile in user_profiles
        const { error: profileErr } = await supabase
            .from('user_profiles')
            .upsert({
                firebase_uid,
                name: name.trim(),
                email: email || req.firebaseUser.email,
                role
            }, { onConflict: 'firebase_uid' });

        if (profileErr) throw profileErr;

        // 2. Insert into role-specific table
        if (role === 'student') {
            const { prn, year, division, department } = req.body;
            if (!prn) return fail(res, 'PRN is required.');
            if (!year) return fail(res, 'Year is required.');
            if (!division) return fail(res, 'Division is required.');
            if (!department) return fail(res, 'Department is required.');

            // Check PRN uniqueness
            const { data: existing } = await supabase
                .from('students')
                .select('id')
                .eq('prn', prn)
                .neq('firebase_uid', firebase_uid)
                .maybeSingle();

            if (existing) return fail(res, 'This PRN is already registered.');

            const { error: studentErr } = await supabase
                .from('students')
                .upsert({
                    firebase_uid,
                    prn: prn.trim().toUpperCase(),
                    year: parseInt(year),
                    division: division.trim().toUpperCase(),
                    department: department.trim()
                }, { onConflict: 'firebase_uid' });

            if (studentErr) throw studentErr;

        } else {
            const { department } = req.body;
            let { teacher_code } = req.body;
            if (!department) return fail(res, 'Department is required.');
            if (!teacher_code) teacher_code = 'TCH' + Math.floor(1000 + Math.random() * 9000);

            const { error: teacherErr } = await supabase
                .from('teachers')
                .upsert({
                    firebase_uid,
                    teacher_code: teacher_code.trim(),
                    department: department.trim()
                }, { onConflict: 'firebase_uid' });

            if (teacherErr) throw teacherErr;
        }

        // 3. Set Firebase custom claims for role-based token checking
        if (firebaseInitialized) {
            await admin.auth().setCustomUserClaims(firebase_uid, { role });
        }

        success(res, {
            message: role === 'student'
                ? 'Student account registered successfully! You can now log in.'
                : 'Teacher account registered successfully! You can now log in.'
        }, 201);

    } catch (err) {
        console.error('Registration error:', err);
        fail(res, err.message || 'Registration failed.', 500);
    }
});

/**
 * GET /api/auth/me
 * Returns profile info for current authenticated user.
 */
app.get('/api/auth/me', verifyFirebaseToken, async (req, res) => {
    if (!checkServices(res)) return;

    try {
        const { data: profile, error } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('firebase_uid', req.firebaseUser.uid)
            .single();

        if (error || !profile) return fail(res, 'Profile not found.', 404);

        let extra = {};
        if (profile.role === 'student') {
            const { data } = await supabase
                .from('students')
                .select('*')
                .eq('firebase_uid', req.firebaseUser.uid)
                .maybeSingle();
            extra = data || {};
        } else {
            const { data } = await supabase
                .from('teachers')
                .select('*')
                .eq('firebase_uid', req.firebaseUser.uid)
                .maybeSingle();
            extra = data || {};
        }

        success(res, { role: profile.role, profile: { ...profile, ...extra } });
    } catch (err) {
        fail(res, err.message, 500);
    }
});

// ============================================================
//  STUDENT ROUTES
// ============================================================

/**
 * GET /api/student/dashboard
 * Full attendance breakdown for enrolled student.
 */
app.get('/api/student/dashboard', requireRole('student'), async (req, res) => {
    try {
        const { data: student, error } = await supabase
            .from('students')
            .select('*, user_profiles(name, email)')
            .eq('firebase_uid', req.firebaseUser.uid)
            .single();

        if (error || !student) return fail(res, 'Student profile not found.', 404);

        // Fetch subjects matching student's year and division
        const { data: subjects } = await supabase
            .from('subjects')
            .select('id, subject_name, subject_code')
            .eq('year', student.year)
            .eq('division', student.division);

        const subjectStats = await Promise.all((subjects || []).map(async (sub) => {
            const { data: records } = await supabase
                .from('attendance')
                .select('status')
                .eq('student_id', student.id)
                .eq('subject_id', sub.id);

            const total = (records || []).length;
            const present = (records || []).filter(r => r.status === 'Present').length;
            const absent = total - present;
            const percentage = total > 0 ? parseFloat(((present / total) * 100).toFixed(1)) : 0.0;

            return {
                subject_id: sub.id,
                subject_name: sub.subject_name,
                subject_code: sub.subject_code,
                total_lectures: total,
                present,
                absent,
                percentage
            };
        }));

        const overallTotal = subjectStats.reduce((a, s) => a + s.total_lectures, 0);
        const overallPresent = subjectStats.reduce((a, s) => a + s.present, 0);
        const overallAbsent = overallTotal - overallPresent;
        const overallPct = overallTotal > 0
            ? parseFloat(((overallPresent / overallTotal) * 100).toFixed(1))
            : 0.0;

        success(res, {
            data: {
                profile: {
                    ...student,
                    name: student.user_profiles?.name,
                    email: student.user_profiles?.email
                },
                overall_total: overallTotal,
                overall_present: overallPresent,
                overall_absent: overallAbsent,
                overall_percentage: overallPct,
                subjects: subjectStats
            }
        });
    } catch (err) {
        fail(res, err.message, 500);
    }
});

/**
 * GET /api/student/attendance
 * History of individual lecture attendance records for logged-in student.
 */
app.get('/api/student/attendance', requireRole('student'), async (req, res) => {
    try {
        const { data: student } = await supabase
            .from('students')
            .select('id')
            .eq('firebase_uid', req.firebaseUser.uid)
            .single();

        if (!student) return fail(res, 'Student not found.', 404);

        const { data: records, error } = await supabase
            .from('attendance')
            .select('id, date, status, subjects(subject_name)')
            .eq('student_id', student.id)
            .order('date', { ascending: false });

        if (error) throw error;

        const result = (records || []).map(r => ({
            id: r.id,
            date: r.date,
            status: r.status,
            branch: r.subjects?.subject_name || 'Course Lecture'
        }));

        res.json(result);
    } catch (err) {
        fail(res, err.message, 500);
    }
});

// ============================================================
//  TEACHER ROUTES
// ============================================================

/**
 * GET /api/teacher/dashboard
 */
app.get('/api/teacher/dashboard', requireRole('teacher'), async (req, res) => {
    try {
        const { data: teacher, error } = await supabase
            .from('teachers')
            .select('*, user_profiles(name, email)')
            .eq('firebase_uid', req.firebaseUser.uid)
            .single();

        if (error || !teacher) return fail(res, 'Teacher profile not found.', 404);

        const { data: subjects } = await supabase
            .from('subjects')
            .select('id, subject_name, subject_code, year, division')
            .eq('teacher_id', teacher.id)
            .order('subject_name');

        success(res, {
            profile: {
                ...teacher,
                name: teacher.user_profiles?.name,
                email: teacher.user_profiles?.email
            },
            subjects: subjects || []
        });
    } catch (err) {
        fail(res, err.message, 500);
    }
});

/**
 * GET /api/teacher/subjects
 */
app.get('/api/teacher/subjects', requireRole('teacher'), async (req, res) => {
    try {
        const { data: teacher } = await supabase
            .from('teachers')
            .select('id')
            .eq('firebase_uid', req.firebaseUser.uid)
            .single();

        if (!teacher) return fail(res, 'Teacher not found.', 404);

        const { data: subjects } = await supabase
            .from('subjects')
            .select('id, subject_name, subject_code, year, division')
            .eq('teacher_id', teacher.id)
            .order('subject_name');

        res.json(subjects || []);
    } catch (err) {
        fail(res, err.message, 500);
    }
});

/**
 * POST /api/teacher/subjects
 */
app.post('/api/teacher/subjects', requireRole('teacher'), async (req, res) => {
    try {
        const { data: teacher } = await supabase
            .from('teachers')
            .select('id')
            .eq('firebase_uid', req.firebaseUser.uid)
            .single();

        if (!teacher) return fail(res, 'Teacher not found.', 404);

        const { subject_name, subject_code, year, division } = req.body || {};
        if (!subject_name) return fail(res, 'Subject name is required.');
        if (!subject_code) return fail(res, 'Subject code is required.');
        if (!year || year < 1 || year > 6) return fail(res, 'Valid year (1-6) is required.');
        if (!division) return fail(res, 'Division is required.');

        const { data: subject, error } = await supabase
            .from('subjects')
            .insert({
                subject_name: subject_name.trim(),
                subject_code: subject_code.trim().toUpperCase(),
                teacher_id: teacher.id,
                year: parseInt(year),
                division: division.trim().toUpperCase()
            })
            .select()
            .single();

        if (error) throw error;

        success(res, { message: 'Subject added successfully!', subject }, 201);
    } catch (err) {
        fail(res, err.message, 500);
    }
});

/**
 * DELETE /api/teacher/subjects/:id
 */
app.delete('/api/teacher/subjects/:id', requireRole('teacher'), async (req, res) => {
    try {
        const { data: teacher } = await supabase
            .from('teachers')
            .select('id')
            .eq('firebase_uid', req.firebaseUser.uid)
            .single();

        if (!teacher) return fail(res, 'Teacher not found.', 404);

        const subjectId = req.params.id;
        const { data: subject } = await supabase
            .from('subjects')
            .select('id, teacher_id')
            .eq('id', subjectId)
            .single();

        if (!subject) return fail(res, 'Subject not found.', 404);
        if (subject.teacher_id !== teacher.id) {
            return fail(res, 'You can only delete subjects you created.', 403);
        }

        await supabase.from('attendance').delete().eq('subject_id', subjectId);
        await supabase.from('subjects').delete().eq('id', subjectId);

        success(res, { message: 'Subject deleted successfully.' });
    } catch (err) {
        fail(res, err.message, 500);
    }
});

/**
 * GET /api/teacher/students?year=X&division=Y
 */
app.get('/api/teacher/students', requireRole('teacher'), async (req, res) => {
    try {
        const { year, division } = req.query;
        if (!year || !division) return fail(res, 'year and division parameters are required.');

        const { data: students, error } = await supabase
            .from('students')
            .select('id, prn, year, division, department, user_profiles(name, email)')
            .eq('year', parseInt(year))
            .eq('division', division)
            .order('prn');

        if (error) throw error;

        const result = (students || []).map(s => ({
            student_id: s.id,
            prn: s.prn,
            year: s.year,
            division: s.division,
            department: s.department,
            name: s.user_profiles?.name,
            email: s.user_profiles?.email
        }));

        res.json(result);
    } catch (err) {
        fail(res, err.message, 500);
    }
});

/**
 * GET /api/teacher/attendance?subject_id=X&date=YYYY-MM-DD
 */
app.get('/api/teacher/attendance', requireRole('teacher'), async (req, res) => {
    try {
        const { subject_id, date } = req.query;
        if (!subject_id || !date) return fail(res, 'subject_id and date are required.');

        const { data: records, error } = await supabase
            .from('attendance')
            .select('id, date, status, students(id, prn, user_profiles(name)), subjects(subject_name)')
            .eq('subject_id', subject_id)
            .eq('date', date)
            .order('date');

        if (error) throw error;

        const result = (records || []).map(r => ({
            id: r.id,
            student_id: r.students?.id,
            roll_no: r.students?.prn,
            name: r.students?.user_profiles?.name,
            branch: r.subjects?.subject_name,
            date: r.date,
            status: r.status
        }));

        res.json(result);
    } catch (err) {
        fail(res, err.message, 500);
    }
});

/**
 * POST /api/teacher/attendance
 */
app.post('/api/teacher/attendance', requireRole('teacher'), async (req, res) => {
    try {
        const { data: teacher } = await supabase
            .from('teachers')
            .select('id')
            .eq('firebase_uid', req.firebaseUser.uid)
            .single();

        if (!teacher) return fail(res, 'Teacher not found.', 404);

        const { subject_id, date, records } = req.body || {};
        if (!subject_id || !date) return fail(res, 'subject_id and date are required.');
        if (!Array.isArray(records) || records.length === 0) {
            return fail(res, 'No attendance records provided.');
        }

        const upsertRows = records.map(r => ({
            student_id: r.student_id,
            subject_id: subject_id,
            teacher_id: teacher.id,
            date: date,
            status: r.status === 'Absent' ? 'Absent' : 'Present'
        }));

        const { error } = await supabase
            .from('attendance')
            .upsert(upsertRows, { onConflict: 'student_id,subject_id,date' });

        if (error) throw error;

        success(res, { message: `Attendance saved for ${records.length} students.` });
    } catch (err) {
        fail(res, err.message, 500);
    }
});

/**
 * GET /api/teacher/reports?subject_id=X
 */
app.get('/api/teacher/reports', requireRole('teacher'), async (req, res) => {
    try {
        const { subject_id } = req.query;
        if (!subject_id) return fail(res, 'subject_id is required.');

        const { data: subj, error: subjErr } = await supabase
            .from('subjects')
            .select('year, division, subject_name')
            .eq('id', subject_id)
            .single();

        if (subjErr || !subj) return fail(res, 'Subject not found.', 404);

        const { data: students } = await supabase
            .from('students')
            .select('id, prn, user_profiles(name)')
            .eq('year', subj.year)
            .eq('division', subj.division);

        const report = await Promise.all((students || []).map(async (st) => {
            const { data: att } = await supabase
                .from('attendance')
                .select('status')
                .eq('student_id', st.id)
                .eq('subject_id', subject_id);

            const total = (att || []).length;
            const present = (att || []).filter(r => r.status === 'Present').length;
            const absent = total - present;
            const pct = total > 0 ? parseFloat(((present / total) * 100).toFixed(1)) : 0.0;

            return {
                student_id: st.id,
                roll_no: st.prn,
                name: st.user_profiles?.name,
                branch: subj.subject_name,
                total_classes: total,
                present,
                absent,
                percentage: pct
            };
        }));

        res.json(report);
    } catch (err) {
        fail(res, err.message, 500);
    }
});

// ============================================================
//  DEPARTMENT & STUDENT CRUD ROUTES
// ============================================================

/**
 * GET /api/reports
 * Overall cumulative student attendance across all subjects.
 */
app.get('/api/reports', verifyFirebaseToken, async (req, res) => {
    if (!checkServices(res)) return;

    try {
        const { data: students } = await supabase
            .from('students')
            .select('id, prn, department, user_profiles(name)')
            .order('prn');

        const report = await Promise.all((students || []).map(async (st) => {
            const { data: att } = await supabase
                .from('attendance')
                .select('status')
                .eq('student_id', st.id);

            const total = (att || []).length;
            const present = (att || []).filter(r => r.status === 'Present').length;
            const absent = total - present;
            const pct = total > 0 ? parseFloat(((present / total) * 100).toFixed(1)) : 0.0;

            return {
                student_id: st.id,
                roll_no: st.prn,
                name: st.user_profiles?.name,
                branch: st.department,
                total_classes: total,
                present,
                absent,
                percentage: pct
            };
        }));

        res.json(report);
    } catch (err) {
        fail(res, err.message, 500);
    }
});

/**
 * GET /api/students
 */
app.get('/api/students', verifyFirebaseToken, async (req, res) => {
    if (!checkServices(res)) return;

    try {
        const { data, error } = await supabase
            .from('students')
            .select('id, prn, year, division, department, user_profiles(name, email)')
            .order('prn');

        if (error) throw error;

        const rows = (data || []).map(s => ({
            id: s.id,
            roll_no: s.prn,
            name: s.user_profiles?.name,
            branch: s.department,
            year: s.year,
            email: s.user_profiles?.email
        }));

        res.json(rows);
    } catch (err) {
        fail(res, err.message, 500);
    }
});

/**
 * POST /api/students — Add a new student record
 */
app.post('/api/students', requireRole('teacher'), async (req, res) => {
    const { roll_no, name, branch, year, email } = req.body || {};
    if (!roll_no || !name || !branch || !year || !email) {
        return fail(res, 'All fields (PRN/roll_no, name, branch, year, email) are required.');
    }

    try {
        const syntheticUid = 'manual_' + Buffer.from(roll_no).toString('hex');

        // Create profile
        const { error: profErr } = await supabase
            .from('user_profiles')
            .upsert({
                firebase_uid: syntheticUid,
                name: name.trim(),
                email: email.trim(),
                role: 'student'
            }, { onConflict: 'firebase_uid' });

        if (profErr) throw profErr;

        // Create student
        const { data: student, error: stuErr } = await supabase
            .from('students')
            .upsert({
                firebase_uid: syntheticUid,
                prn: roll_no.trim().toUpperCase(),
                year: parseInt(year),
                division: 'A',
                department: branch.trim()
            }, { onConflict: 'firebase_uid' })
            .select()
            .single();

        if (stuErr) throw stuErr;

        success(res, {
            message: 'Student added successfully.',
            student: {
                id: student.id,
                roll_no: student.prn,
                name,
                branch: student.department,
                year: student.year,
                email
            }
        }, 201);
    } catch (err) {
        fail(res, err.message, 500);
    }
});

/**
 * PUT /api/students/:id — Update student record
 */
app.put('/api/students/:id', requireRole('teacher'), async (req, res) => {
    const { roll_no, name, branch, year, email } = req.body || {};
    const studentId = req.params.id;

    try {
        const { data: st, error: findErr } = await supabase
            .from('students')
            .select('firebase_uid')
            .eq('id', studentId)
            .single();

        if (findErr || !st) return fail(res, 'Student not found.', 404);

        if (name || email) {
            await supabase
                .from('user_profiles')
                .update({
                    ...(name ? { name: name.trim() } : {}),
                    ...(email ? { email: email.trim() } : {})
                })
                .eq('firebase_uid', st.firebase_uid);
        }

        const { data: updated, error: updErr } = await supabase
            .from('students')
            .update({
                ...(roll_no ? { prn: roll_no.trim().toUpperCase() } : {}),
                ...(year ? { year: parseInt(year) } : {}),
                ...(branch ? { department: branch.trim() } : {})
            })
            .eq('id', studentId)
            .select()
            .single();

        if (updErr) throw updErr;

        success(res, {
            message: 'Student updated successfully.',
            student: {
                id: studentId,
                roll_no: updated.prn,
                name,
                branch: updated.department,
                year: updated.year,
                email
            }
        });
    } catch (err) {
        fail(res, err.message, 500);
    }
});

/**
 * DELETE /api/students/:id — Delete student record
 */
app.delete('/api/students/:id', requireRole('teacher'), async (req, res) => {
    const studentId = req.params.id;
    try {
        const { data: st } = await supabase
            .from('students')
            .select('firebase_uid')
            .eq('id', studentId)
            .single();

        if (!st) return fail(res, 'Student not found.', 404);

        await supabase.from('attendance').delete().eq('student_id', studentId);
        await supabase.from('students').delete().eq('id', studentId);
        await supabase.from('user_profiles').delete().eq('firebase_uid', st.firebase_uid);

        success(res, { message: 'Student deleted successfully.' });
    } catch (err) {
        fail(res, err.message, 500);
    }
});

/**
 * GET /api/dashboard
 */
app.get('/api/dashboard', verifyFirebaseToken, async (req, res) => {
    if (!checkServices(res)) return;

    try {
        const today = new Date().toISOString().slice(0, 10);
        const { count: total } = await supabase
            .from('students')
            .select('*', { count: 'exact', head: true });

        const { data: todayAtt } = await supabase
            .from('attendance')
            .select('student_id, status')
            .eq('date', today);

        const presentSet = new Set((todayAtt || []).filter(r => r.status === 'Present').map(r => r.student_id));
        const absentSet  = new Set((todayAtt || []).filter(r => r.status === 'Absent').map(r => r.student_id));

        res.json({
            total_students: total || 0,
            present_today: presentSet.size,
            absent_today: absentSet.size,
            attendance_percentage: total > 0 ? parseFloat(((presentSet.size / total) * 100).toFixed(1)) : 0.0,
            date: today
        });
    } catch (err) {
        fail(res, err.message, 500);
    }
});

// ── Health and Diagnostics ────────────────────────────────────
app.get(['/', '/api/health'], (_req, res) => {
    res.json({
        status: 'online',
        service: 'Smart Attendance Management System v2.0',
        backend: 'Node.js + Express',
        database: supabase ? 'Supabase (PostgreSQL)' : 'Supabase (Missing .env credentials)',
        auth: firebaseInitialized ? 'Firebase Admin Auth' : 'Firebase (Missing .env credentials)',
        timestamp: new Date().toISOString()
    });
});

// ── Start ──────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`🚀 Smart Attendance Server listening on http://localhost:${PORT}`);
    console.log(`📡 Health Check: http://localhost:${PORT}/api/health`);
});
