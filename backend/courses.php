<?php
require_once 'config.php';

set_headers('GET, POST, PUT, DELETE');

$method = $_SERVER['REQUEST_METHOD'];
$db     = get_db();

// ──────────────────────────────────────────────
// GET /courses  — return all courses with teacher name
// ──────────────────────────────────────────────
if ($method === 'GET') {
    // Double-join: courses → teachers → users to get the teacher's name
    $result = $db->query(
        'SELECT c.course_id, c.course_code, c.course_name, c.semester, c.teacher_id,
                u.name AS teacher_name
         FROM courses c
         LEFT JOIN teachers t ON t.teacher_id = c.teacher_id
         LEFT JOIN users u    ON u.user_id     = t.user_id
         ORDER BY c.course_name'
    );

    $courses = [];
    while ($row = $result->fetch_assoc()) {
        $courses[] = $row;
    }

    $db->close();
    json_response($courses);
}

// ──────────────────────────────────────────────
// POST /courses  — add a new course
// Body: { "course_code": "CS101", "course_name": "Intro to CS", "teacher_id": 2, "semester": "2026-1" }
// ──────────────────────────────────────────────
if ($method === 'POST') {
    $body        = get_json_body();
    $course_code = trim($body['course_code'] ?? '');
    $course_name = trim($body['course_name'] ?? '');
    $teacher_id  = isset($body['teacher_id']) ? (int) $body['teacher_id'] : 0;
    $semester    = trim($body['semester']    ?? '');

    if ($course_code === '' || $course_name === '') {
        json_response(['error' => 'course_code and course_name are required'], 400);
    }

    $stmt = $db->prepare(
        'INSERT INTO courses (course_code, course_name, teacher_id, semester) VALUES (?, ?, ?, ?)'
    );
    // teacher_id may be NULL when no teacher is assigned yet
    $tid = $teacher_id > 0 ? $teacher_id : null;
    $stmt->bind_param('ssis', $course_code, $course_name, $tid, $semester);

    if (!$stmt->execute()) {
        $stmt->close();
        $db->close();
        json_response(['error' => 'Could not create course: ' . $db->error], 409);
    }

    $course_id = $stmt->insert_id;
    $stmt->close();
    $db->close();

    json_response(['message' => 'Course created', 'course_id' => $course_id], 201);
}

// ──────────────────────────────────────────────
// PUT /courses  — update an existing course
// Body: { "course_id": 7, "course_code": "CS101", "course_name": "...", "teacher_id": 2 }
// ──────────────────────────────────────────────
if ($method === 'PUT') {
    $body        = get_json_body();
    $course_id   = isset($body['course_id'])  ? (int) $body['course_id']  : 0;
    $course_code = trim($body['course_code']  ?? '');
    $course_name = trim($body['course_name']  ?? '');
    $teacher_id  = isset($body['teacher_id']) ? (int) $body['teacher_id'] : 0;

    if ($course_id <= 0 || $course_code === '' || $course_name === '') {
        json_response(['error' => 'course_id, course_code, and course_name are required'], 400);
    }

    $tid  = $teacher_id > 0 ? $teacher_id : null;
    $stmt = $db->prepare(
        'UPDATE courses SET course_code = ?, course_name = ?, teacher_id = ? WHERE course_id = ?'
    );
    $stmt->bind_param('ssii', $course_code, $course_name, $tid, $course_id);
    $stmt->execute();
    $affected = $stmt->affected_rows;
    $stmt->close();
    $db->close();

    if ($affected < 0) {
        json_response(['error' => 'Course not found'], 404);
    }

    json_response(['success' => true]);
}

// ──────────────────────────────────────────────
// DELETE /courses  — remove a course by course_id
// Body: { "course_id": 7 }
// ──────────────────────────────────────────────
if ($method === 'DELETE') {
    $body      = get_json_body();
    $course_id = isset($body['course_id']) ? (int) $body['course_id'] : 0;

    if ($course_id <= 0) {
        json_response(['error' => 'A valid course_id is required'], 400);
    }

    $stmt = $db->prepare('DELETE FROM courses WHERE course_id = ?');
    $stmt->bind_param('i', $course_id);
    $stmt->execute();
    $affected = $stmt->affected_rows;
    $stmt->close();
    $db->close();

    if ($affected === 0) {
        json_response(['error' => 'Course not found'], 404);
    }

    json_response(['message' => 'Course deleted']);
}

$db->close();
json_response(['error' => 'Method not allowed'], 405);
