-- ============================================================
--  Smart Attendance Management System — Supabase Schema
--  Run this in Supabase SQL Editor to set up the database
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── user_profiles ─────────────────────────────────────────────
-- Mirrors Firebase users with extended profile data
CREATE TABLE IF NOT EXISTS user_profiles (
    id           UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    firebase_uid TEXT UNIQUE NOT NULL,
    name         TEXT NOT NULL,
    email        TEXT UNIQUE NOT NULL,
    role         TEXT NOT NULL CHECK (role IN ('student', 'teacher')),
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── students ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS students (
    id           UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    firebase_uid TEXT UNIQUE NOT NULL REFERENCES user_profiles(firebase_uid) ON DELETE CASCADE,
    prn          TEXT UNIQUE NOT NULL,
    year         INTEGER NOT NULL CHECK (year BETWEEN 1 AND 6),
    division     TEXT NOT NULL,
    department   TEXT NOT NULL,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── teachers ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teachers (
    id           UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    firebase_uid TEXT UNIQUE NOT NULL REFERENCES user_profiles(firebase_uid) ON DELETE CASCADE,
    teacher_code TEXT UNIQUE NOT NULL,
    department   TEXT NOT NULL,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── subjects ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subjects (
    id           UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    subject_name TEXT NOT NULL,
    subject_code TEXT NOT NULL,
    teacher_id   UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    year         INTEGER NOT NULL CHECK (year BETWEEN 1 AND 6),
    division     TEXT NOT NULL,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(subject_code, teacher_id, year, division)
);

-- ── attendance ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance (
    id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL REFERENCES teachers(id),
    date       DATE NOT NULL,
    status     TEXT NOT NULL CHECK (status IN ('Present', 'Absent')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, subject_id, date)
);

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_students_year_div    ON students(year, division);
CREATE INDEX IF NOT EXISTS idx_subjects_teacher     ON subjects(teacher_id);
CREATE INDEX IF NOT EXISTS idx_subjects_year_div    ON subjects(year, division);
CREATE INDEX IF NOT EXISTS idx_attendance_student   ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_subject   ON attendance(subject_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date      ON attendance(date);

-- ── Row Level Security (RLS) ──────────────────────────────────
-- Enable RLS on all tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE students      ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects      ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance    ENABLE ROW LEVEL SECURITY;

-- Since we use service_role key from backend, bypass RLS for server calls.
-- The frontend should NEVER access Supabase directly; all requests go through our Node.js backend.

-- Allow service_role to bypass RLS (default Supabase behavior).
-- No additional policies needed for backend-only access.

-- ── Updated_at trigger ────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_user_profiles
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_attendance
    BEFORE UPDATE ON attendance
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
