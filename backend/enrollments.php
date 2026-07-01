<?php
ini_set('display_errors', 0);
error_reporting(0);
header('Content-Type: application/json');
require_once 'config.php';

set_headers('GET, POST');

$method = $_SERVER['REQUEST_METHOD'];
$db     = get_db();

// Auto-create table on first use — no schema change to existing tables
$db->query(
    'CREATE TABLE IF NOT EXISTS enrollments (
        enrollment_id INT AUTO_INCREMENT PRIMARY KEY,
        course_id     INT NOT NULL,
        student_id    INT NOT NULL,
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_enrollment (course_id, student_id)
    )'
);

// ──────────────────────────────────────────────
// GET ?counts=1  — enrolled count per course + grand total
//     { "counts": { "7": 3, "9": 5 }, "total": 8 }
// ──────────────────────────────────────────────
if ($method === 'GET' && isset($_GET['counts'])) {
    $result = $db->query(
        'SELECT course_id, COUNT(*) AS cnt FROM enrollments GROUP BY course_id'
    );
    $counts = [];
    $total  = 0;
    while ($row = $result->fetch_assoc()) {
        $counts[(string) $row['course_id']] = (int) $row['cnt'];
        $total += (int) $row['cnt'];
    }
    $db->close();
    json_response(['counts' => $counts, 'total' => $total]);
}

// ──────────────────────────────────────────────
// GET ?student_id=X  — course_ids the student is enrolled in
//     returns: [7, 9, 12]
// ──────────────────────────────────────────────
if ($method === 'GET' && isset($_GET['student_id'])) {
    $student_id = (int) $_GET['student_id'];

    if ($student_id <= 0) {
        $db->close();
        json_response(['error' => 'A valid student_id is required'], 400);
    }

    $stmt = $db->prepare('SELECT course_id FROM enrollments WHERE student_id = ?');
    $stmt->bind_param('i', $student_id);
    $stmt->execute();
    $result = $stmt->get_result();

    $ids = [];
    while ($row = $result->fetch_assoc()) {
        $ids[] = (int) $row['course_id'];
    }
    $stmt->close();
    $db->close();
    json_response($ids);
}

// ──────────────────────────────────────────────
// GET ?course_id=X  — all students with enrolled: true/false
// ──────────────────────────────────────────────
if ($method === 'GET') {
    $course_id = isset($_GET['course_id']) ? (int) $_GET['course_id'] : 0;

    if ($course_id <= 0) {
        $db->close();
        json_response(['error' => 'A valid course_id is required'], 400);
    }

    $stmt = $db->prepare(
        'SELECT s.student_id, u.name, s.roll_number,
                IF(e.course_id IS NOT NULL, 1, 0) AS enrolled
         FROM students s
         JOIN users u ON s.user_id = u.user_id
         LEFT JOIN enrollments e
                ON e.student_id = s.student_id AND e.course_id = ?
         ORDER BY u.name'
    );
    $stmt->bind_param('i', $course_id);
    $stmt->execute();
    $result = $stmt->get_result();

    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $row['enrolled'] = (bool) $row['enrolled'];
        $rows[] = $row;
    }
    $stmt->close();
    $db->close();
    json_response($rows);
}

// ──────────────────────────────────────────────
// POST  — replace all enrollments for a course
// Body: { "course_id": 7, "student_ids": [1, 3, 5] }
// ──────────────────────────────────────────────
if ($method === 'POST') {
    $body        = get_json_body();
    $course_id   = isset($body['course_id'])   ? (int) $body['course_id'] : 0;
    $student_ids = isset($body['student_ids']) && is_array($body['student_ids'])
                   ? $body['student_ids'] : [];

    if ($course_id <= 0) {
        $db->close();
        json_response(['error' => 'A valid course_id is required'], 400);
    }

    // Replace: delete existing, insert new set
    $stmt = $db->prepare('DELETE FROM enrollments WHERE course_id = ?');
    $stmt->bind_param('i', $course_id);
    $stmt->execute();
    $stmt->close();

    if (count($student_ids) > 0) {
        $stmt = $db->prepare('INSERT IGNORE INTO enrollments (course_id, student_id) VALUES (?, ?)');
        foreach ($student_ids as $sid) {
            $sid = (int) $sid;
            if ($sid <= 0) continue;
            $stmt->bind_param('ii', $course_id, $sid);
            $stmt->execute();
        }
        $stmt->close();
    }

    $db->close();
    json_response(['success' => true]);
}

$db->close();
json_response(['error' => 'Method not allowed'], 405);
