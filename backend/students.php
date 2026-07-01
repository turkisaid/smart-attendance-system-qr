<?php
require_once 'config.php';

set_headers('GET, POST, PUT, DELETE');

$method = $_SERVER['REQUEST_METHOD'];
$db     = get_db();

// ──────────────────────────────────────────────
// GET /students  — return all students
// Joins users to fetch name/email (stored in users table)
// ──────────────────────────────────────────────
if ($method === 'GET') {
    $result = $db->query(
        'SELECT s.student_id, u.name, u.email, s.roll_number
         FROM students s
         JOIN users u ON s.user_id = u.user_id
         ORDER BY u.name'
    );
    $students = [];

    while ($row = $result->fetch_assoc()) {
        $students[] = $row;
    }

    $db->close();
    json_response($students);
}

// ──────────────────────────────────────────────
// POST /students  — add a new student
// Body: { "name": "...", "email": "...", "roll_number": "...", "password": "..." }
// Inserts into users first, then links via user_id into students
// ──────────────────────────────────────────────
if ($method === 'POST') {
    $body        = get_json_body();
    $name        = trim($body['name']        ?? '');
    $email       = trim($body['email']       ?? '');
    $roll_number = trim($body['roll_number'] ?? '');
    $password    = trim($body['password']    ?? '');

    if ($name === '' || $email === '' || $roll_number === '' || $password === '') {
        json_response(['error' => 'name, email, roll_number, and password are required'], 400);
    }

    // Hash the password before storing in users
    $hash = password_hash($password, PASSWORD_BCRYPT);

    // Step 1: create the login account in users
    $stmt = $db->prepare(
        'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)'
    );
    $role = 'student';
    $stmt->bind_param('ssss', $name, $email, $hash, $role);

    if (!$stmt->execute()) {
        $stmt->close();
        $db->close();
        json_response(['error' => 'Could not create user account: ' . $db->error], 409);
    }

    $user_id = $stmt->insert_id;
    $stmt->close();

    // Step 2: create the student profile linked to the user account
    $stmt = $db->prepare(
        'INSERT INTO students (user_id, roll_number) VALUES (?, ?)'
    );
    $stmt->bind_param('is', $user_id, $roll_number);

    if (!$stmt->execute()) {
        // Roll back the users row to avoid orphaned accounts
        $db->query("DELETE FROM users WHERE user_id = $user_id");
        $stmt->close();
        $db->close();
        json_response(['error' => 'Could not create student profile: ' . $db->error], 409);
    }

    $student_id = $stmt->insert_id;
    $stmt->close();
    $db->close();

    json_response(['message' => 'Student created', 'student_id' => $student_id], 201);
}

// ──────────────────────────────────────────────
// PUT /students  — update an existing student
// Body: { "student_id": 5, "name": "...", "email": "...", "roll_number": "..." }
// Updates name/email in users and roll_number in students
// ──────────────────────────────────────────────
if ($method === 'PUT') {
    $body       = get_json_body();
    $student_id = isset($body['student_id']) ? (int) $body['student_id'] : 0;
    $name       = trim($body['name']        ?? '');
    $email      = trim($body['email']       ?? '');
    $roll       = trim($body['roll_number'] ?? '');

    if ($student_id <= 0 || $name === '' || $email === '' || $roll === '') {
        json_response(['error' => 'student_id, name, email, and roll_number are required'], 400);
    }

    // Resolve the linked user_id
    $stmt = $db->prepare('SELECT user_id FROM students WHERE student_id = ?');
    $stmt->bind_param('i', $student_id);
    $stmt->execute();
    $stmt->bind_result($user_id);
    $found = $stmt->fetch();
    $stmt->close();

    if (!$found) {
        $db->close();
        json_response(['error' => 'Student not found'], 404);
    }

    // Update the login account name/email
    $stmt = $db->prepare('UPDATE users SET name = ?, email = ? WHERE user_id = ?');
    $stmt->bind_param('ssi', $name, $email, $user_id);
    $stmt->execute();
    $stmt->close();

    // Update the student profile roll number
    $stmt = $db->prepare('UPDATE students SET roll_number = ? WHERE student_id = ?');
    $stmt->bind_param('si', $roll, $student_id);
    $stmt->execute();
    $stmt->close();

    $db->close();
    json_response(['success' => true]);
}

// ──────────────────────────────────────────────
// DELETE /students  — remove a student by student_id
// Body: { "student_id": 5 }
// Deletes the students row then the linked users row
// ──────────────────────────────────────────────
if ($method === 'DELETE') {
    $body       = get_json_body();
    $student_id = isset($body['student_id']) ? (int) $body['student_id'] : 0;

    if ($student_id <= 0) {
        json_response(['error' => 'A valid student_id is required'], 400);
    }

    // Retrieve the linked user_id before deleting
    $stmt = $db->prepare('SELECT user_id FROM students WHERE student_id = ?');
    $stmt->bind_param('i', $student_id);
    $stmt->execute();
    $stmt->bind_result($user_id);
    $found = $stmt->fetch();
    $stmt->close();

    if (!$found) {
        $db->close();
        json_response(['error' => 'Student not found'], 404);
    }

    // Delete student profile first (respects FK constraints), then the user account
    $stmt = $db->prepare('DELETE FROM students WHERE student_id = ?');
    $stmt->bind_param('i', $student_id);
    $stmt->execute();
    $stmt->close();

    $stmt = $db->prepare('DELETE FROM users WHERE user_id = ?');
    $stmt->bind_param('i', $user_id);
    $stmt->execute();
    $stmt->close();

    $db->close();
    json_response(['message' => 'Student deleted']);
}

// Any other HTTP method is not supported
$db->close();
json_response(['error' => 'Method not allowed'], 405);
