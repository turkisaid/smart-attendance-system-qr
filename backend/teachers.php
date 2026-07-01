<?php
ini_set('display_errors', 0);
error_reporting(0);
header('Content-Type: application/json');
require_once 'config.php';

set_headers('GET, POST, PUT, DELETE');

$method = $_SERVER['REQUEST_METHOD'];
$db     = get_db();

// ──────────────────────────────────────────────
// GET /teachers  — return all teachers
// Joins users to fetch name/email (stored in users table)
// ──────────────────────────────────────────────
if ($method === 'GET') {
    $result = $db->query(
        'SELECT t.teacher_id, u.name, u.email, t.employee_id, t.subject
         FROM teachers t
         JOIN users u ON t.user_id = u.user_id
         ORDER BY u.name'
    );
    $teachers = [];

    while ($row = $result->fetch_assoc()) {
        $teachers[] = $row;
    }

    $db->close();
    json_response($teachers);
}

// ──────────────────────────────────────────────
// POST /teachers  — add a new teacher
// Body: { "name": "...", "email": "...", "employee_id": "...", "subject": "...", "password": "..." }
// Inserts into users first, then links via user_id into teachers
// ──────────────────────────────────────────────
if ($method === 'POST') {
    $body        = get_json_body();
    $name        = trim($body['name']        ?? '');
    $email       = trim($body['email']       ?? '');
    $employee_id = trim($body['employee_id'] ?? '');
    $subject     = trim($body['subject']     ?? '');
    $password    = trim($body['password']    ?? '');

    if ($name === '' || $email === '' || $employee_id === '' || $password === '') {
        json_response(['error' => 'name, email, employee_id, and password are required'], 400);
    }

    // Check for duplicate email before attempting insert
    $chk = $db->prepare('SELECT user_id FROM users WHERE email = ? LIMIT 1');
    $chk->bind_param('s', $email);
    $chk->execute();
    $chk->store_result();
    if ($chk->num_rows > 0) {
        $chk->close();
        $db->close();
        json_response(['error' => 'Email already exists'], 409);
    }
    $chk->close();

    $hash = password_hash($password, PASSWORD_BCRYPT);

    // Step 1: create the login account in users
    $stmt = $db->prepare(
        'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)'
    );
    $role = 'teacher';
    $stmt->bind_param('ssss', $name, $email, $hash, $role);

    if (!$stmt->execute()) {
        $stmt->close();
        $db->close();
        json_response(['error' => 'Could not create user account: ' . $db->error], 409);
    }

    $user_id = $stmt->insert_id;
    $stmt->close();

    // Step 2: create the teacher profile linked to the user account
    $stmt = $db->prepare(
        'INSERT INTO teachers (user_id, employee_id, subject) VALUES (?, ?, ?)'
    );
    $stmt->bind_param('iss', $user_id, $employee_id, $subject);

    if (!$stmt->execute()) {
        $db->query("DELETE FROM users WHERE user_id = $user_id");
        $stmt->close();
        $db->close();
        json_response(['error' => 'Could not create teacher profile: ' . $db->error], 409);
    }

    $teacher_id = $stmt->insert_id;
    $stmt->close();
    $db->close();

    json_response(['message' => 'Teacher created', 'teacher_id' => $teacher_id], 201);
}

// ──────────────────────────────────────────────
// PUT /teachers  — update an existing teacher
// Body: { "teacher_id": 3, "name": "...", "email": "...", "employee_id": "...", "subject": "..." }
// Updates name/email in users and employee_id/subject in teachers
// ──────────────────────────────────────────────
if ($method === 'PUT') {
    $body        = get_json_body();
    $teacher_id  = isset($body['teacher_id']) ? (int) $body['teacher_id'] : 0;
    $name        = trim($body['name']        ?? '');
    $email       = trim($body['email']       ?? '');
    $employee_id = trim($body['employee_id'] ?? '');
    $subject     = trim($body['subject']     ?? '');

    if ($teacher_id <= 0 || $name === '' || $email === '' || $employee_id === '') {
        json_response(['error' => 'teacher_id, name, email, and employee_id are required'], 400);
    }

    // Resolve the linked user_id
    $stmt = $db->prepare('SELECT user_id FROM teachers WHERE teacher_id = ?');
    $stmt->bind_param('i', $teacher_id);
    $stmt->execute();
    $stmt->bind_result($user_id);
    $found = $stmt->fetch();
    $stmt->close();

    if (!$found) {
        $db->close();
        json_response(['error' => 'Teacher not found'], 404);
    }

    // Update the login account name/email
    $stmt = $db->prepare('UPDATE users SET name = ?, email = ? WHERE user_id = ?');
    $stmt->bind_param('ssi', $name, $email, $user_id);
    $stmt->execute();
    $stmt->close();

    // Update the teacher profile employee_id/subject
    $stmt = $db->prepare('UPDATE teachers SET employee_id = ?, subject = ? WHERE teacher_id = ?');
    $stmt->bind_param('ssi', $employee_id, $subject, $teacher_id);
    $stmt->execute();
    $stmt->close();

    $db->close();
    json_response(['success' => true]);
}

// ──────────────────────────────────────────────
// DELETE /teachers  — remove a teacher by teacher_id
// Body: { "teacher_id": 3 }
// Deletes the teachers row then the linked users row
// ──────────────────────────────────────────────
if ($method === 'DELETE') {
    $body       = get_json_body();
    $teacher_id = isset($body['teacher_id']) ? (int) $body['teacher_id'] : 0;

    if ($teacher_id <= 0) {
        json_response(['error' => 'A valid teacher_id is required'], 400);
    }

    // Retrieve the linked user_id before deleting
    $stmt = $db->prepare('SELECT user_id FROM teachers WHERE teacher_id = ?');
    $stmt->bind_param('i', $teacher_id);
    $stmt->execute();
    $stmt->bind_result($user_id);
    $found = $stmt->fetch();
    $stmt->close();

    if (!$found) {
        $db->close();
        json_response(['error' => 'Teacher not found'], 404);
    }

    // Delete teacher profile first, then the user account
    $stmt = $db->prepare('DELETE FROM teachers WHERE teacher_id = ?');
    $stmt->bind_param('i', $teacher_id);
    $stmt->execute();
    $stmt->close();

    $stmt = $db->prepare('DELETE FROM users WHERE user_id = ?');
    $stmt->bind_param('i', $user_id);
    $stmt->execute();
    $stmt->close();

    $db->close();
    json_response(['message' => 'Teacher deleted']);
}

$db->close();
json_response(['error' => 'Method not allowed'], 405);
