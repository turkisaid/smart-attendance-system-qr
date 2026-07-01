-- Run this once in phpMyAdmin or the MySQL CLI to create the database and tables.

CREATE DATABASE IF NOT EXISTS attendance_db
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE attendance_db;

-- ── Users (login accounts for admins, teachers, and students) ──────────────
CREATE TABLE IF NOT EXISTS users (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role          ENUM('admin', 'teacher', 'student') NOT NULL DEFAULT 'student',
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Login sessions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id    INT UNSIGNED NOT NULL,
    token      VARCHAR(64)  NOT NULL UNIQUE,
    expires_at DATETIME     NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── Teachers ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teachers (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(255) NOT NULL,
    email         VARCHAR(255) NOT NULL UNIQUE,
    employee_id   VARCHAR(50)  NOT NULL UNIQUE,
    department    VARCHAR(100),
    password_hash VARCHAR(255) NOT NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Students ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS students (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(255) NOT NULL,
    email         VARCHAR(255) NOT NULL UNIQUE,
    student_id    VARCHAR(50)  NOT NULL UNIQUE,  -- e.g. "2023-00123"
    password_hash VARCHAR(255) NOT NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Courses ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS courses (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    course_code VARCHAR(20)  NOT NULL UNIQUE,
    course_name VARCHAR(255) NOT NULL,
    teacher_id  INT UNSIGNED,
    schedule    VARCHAR(100),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE SET NULL
);

-- ── Attendance records ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    student_id INT UNSIGNED NOT NULL,
    course_id  INT UNSIGNED NOT NULL,
    status     ENUM('present', 'late', 'absent', 'excused') NOT NULL DEFAULT 'present',
    scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id)  REFERENCES courses(id)  ON DELETE CASCADE,
    -- Prevent recording the same student twice in the same course on the same day
    UNIQUE KEY unique_daily_attendance (student_id, course_id, (DATE(scanned_at)))
);

-- ── QR tokens (one-time tokens embedded in student QR codes) ──────────────
CREATE TABLE IF NOT EXISTS qr_tokens (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    student_id INT UNSIGNED NOT NULL,
    token      VARCHAR(64)  NOT NULL UNIQUE,
    expires_at DATETIME     NOT NULL,
    used_at    DATETIME     DEFAULT NULL,   -- NULL means the token hasn't been scanned yet
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

-- ── Seed: default admin account (password: admin1234) ─────────────────────
INSERT IGNORE INTO users (email, password_hash, role)
VALUES ('admin@school.edu', '$2y$12$YourBcryptHashHere', 'admin');
-- Replace the hash above by running: php -r "echo password_hash('admin1234', PASSWORD_BCRYPT);"
