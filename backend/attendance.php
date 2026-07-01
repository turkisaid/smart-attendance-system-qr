<?php
// Suppress PHP warnings/notices from polluting JSON output
ini_set('display_errors', 0);
error_reporting(0);

// JSON header must appear before any output
header('Content-Type: application/json; charset=utf-8');

require_once 'config.php';

try {
    set_headers('GET, POST');

    $method = $_SERVER['REQUEST_METHOD'];
    $db     = get_db();

    // ──────────────────────────────────────────────────────────────────────
    // GET /attendance?course_id=3[&date=2026-04-28]
    // Actual columns: attendance_id, student_id, course_id, qr_id, timestamp, status
    // Name comes from users (via students.user_id), not from students directly
    // ──────────────────────────────────────────────────────────────────────
    if ($method === 'GET') {
        $course_id = isset($_GET['course_id']) ? (int) $_GET['course_id'] : 0;

        if ($course_id <= 0) {
            json_response(['error' => 'course_id query parameter is required'], 400);
        }

        $date = isset($_GET['date']) ? trim($_GET['date']) : null;

        // Alias `timestamp` → `scanned_at` so the frontend key stays consistent
        $base_sql =
            'SELECT a.attendance_id, a.student_id,
                    u.name AS student_name, s.roll_number AS student_number,
                    a.course_id, a.status,
                    a.timestamp AS scanned_at
             FROM attendance a
             JOIN students s ON s.student_id = a.student_id
             JOIN users    u ON u.user_id     = s.user_id
             WHERE a.course_id = ?';

        if ($date !== null) {
            $stmt = $db->prepare($base_sql . ' AND DATE(a.timestamp) = ? ORDER BY u.name');
            if (!$stmt) {
                error_log("attendance GET (date) prepare failed: " . $db->error);
                json_response(['error' => 'Database error: ' . $db->error], 500);
            }
            $stmt->bind_param('is', $course_id, $date);
        } else {
            $stmt = $db->prepare($base_sql . ' ORDER BY a.timestamp DESC');
            if (!$stmt) {
                error_log("attendance GET prepare failed: " . $db->error);
                json_response(['error' => 'Database error: ' . $db->error], 500);
            }
            $stmt->bind_param('i', $course_id);
        }

        $stmt->execute();
        $result  = $stmt->get_result();
        $records = [];

        while ($row = $result->fetch_assoc()) {
            $records[] = $row;
        }

        $stmt->close();
        $db->close();
        json_response($records);
    }

    // ──────────────────────────────────────────────────────────────────────
    // POST /attendance
    // Body: { "student_id": 4, "course_id": 2, "status": "present" }
    // status only accepts 'present' or 'absent' (matches DB enum)
    // qr_id is nullable so we omit it; timestamp has DEFAULT current_timestamp()
    // ──────────────────────────────────────────────────────────────────────
    if ($method === 'POST') {
        $body       = get_json_body();
        $student_id = isset($body['student_id']) ? (int) $body['student_id'] : 0;
        $course_id  = isset($body['course_id'])  ? (int) $body['course_id']  : 0;
        $status     = trim($body['status'] ?? 'present');

        if ($student_id <= 0 || $course_id <= 0) {
            json_response(['error' => 'student_id and course_id are required'], 400);
        }

        // Map any extended status value down to what the enum accepts
        if (!in_array($status, ['present', 'absent'], true)) {
            $status = 'present';
        }

        // Duplicate check uses `timestamp` (the actual column name)
        $today = date('Y-m-d');
        $check = $db->prepare(
            'SELECT 1 FROM attendance
             WHERE student_id = ? AND course_id = ? AND DATE(timestamp) = ?
             LIMIT 1'
        );
        if (!$check) {
            error_log("attendance duplicate-check prepare failed: " . $db->error);
            json_response(['error' => 'Database error: ' . $db->error], 500);
        }

        $check->bind_param('iis', $student_id, $course_id, $today);
        $check->execute();
        $check->store_result();
        $already_exists = $check->num_rows > 0;
        $check->close();

        if ($already_exists) {
            $db->close();
            json_response(
                ['error' => 'Attendance already recorded for this student in this course today'],
                409
            );
        }

        // Insert — omit qr_id (nullable) and timestamp (DEFAULT current_timestamp())
        $stmt = $db->prepare(
            'INSERT INTO attendance (student_id, course_id, status) VALUES (?, ?, ?)'
        );
        if (!$stmt) {
            error_log("attendance INSERT prepare failed: " . $db->error);
            json_response(['error' => 'Database error: ' . $db->error], 500);
        }

        $stmt->bind_param('iis', $student_id, $course_id, $status);

        if (!$stmt->execute()) {
            error_log("attendance INSERT execute failed: " . $stmt->error);
            $stmt->close();
            $db->close();
            json_response(['error' => 'Could not record attendance: ' . $stmt->error], 500);
        }

        $new_id = $stmt->insert_id;
        $stmt->close();
        $db->close();

        json_response(['message' => 'Attendance recorded', 'id' => $new_id], 201);
    }

    $db->close();
    json_response(['error' => 'Method not allowed'], 405);

} catch (Throwable $e) {
    error_log("attendance.php exception: " . $e->getMessage() . " in " . $e->getFile() . " line " . $e->getLine());
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
    exit;
}
