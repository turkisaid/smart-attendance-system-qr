<?php
ini_set('display_errors', 0);
error_reporting(0);
header('Content-Type: application/json');

require_once 'config.php';

set_headers('POST');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['error' => 'Method not allowed'], 405);
}

$body      = get_json_body();
$token     = trim($body['token']     ?? '');
$course_id = isset($body['course_id']) ? (int) $body['course_id'] : 0;

if ($token === '' || $course_id <= 0) {
    json_response(['error' => 'token and course_id are required'], 400);
}

$db = get_db();

// ── Step 1: Look up the token ──────────────────────────────────────────────
$stmt = $db->prepare(
    'SELECT qr_id, student_id, expiry_time, is_used FROM qr_codes WHERE token = ? LIMIT 1'
);
$stmt->bind_param('s', $token);
$stmt->execute();
$result = $stmt->get_result();
$record = $result->fetch_assoc();
$stmt->close();

if (!$record) {
    $db->close();
    json_response(['error' => 'Invalid token'], 401);
}

// ── Step 2: Reject if the token has already been used ─────────────────────
if ($record['is_used'] == 1) {
    $db->close();
    json_response(['error' => 'Token has already been used'], 409);
}

// ── Step 3: Reject if the token has expired ───────────────────────────────
if (strtotime($record['expiry_time']) < time()) {
    $db->close();
    json_response(['error' => 'Token has expired', 'expired_at' => $record['expiry_time']], 401);
}

$student_id = (int) $record['student_id'];
$qr_id      = (int) $record['qr_id'];

// ── Step 4: Prevent duplicate attendance for today ────────────────────────
$today = date('Y-m-d');
$check = $db->prepare(
    'SELECT attendance_id FROM attendance WHERE student_id = ? AND course_id = ? AND DATE(timestamp) = ?'
);
$check->bind_param('iis', $student_id, $course_id, $today);
$check->execute();
$check->store_result();

if ($check->num_rows > 0) {
    $check->close();
    $db->close();
    json_response(['error' => 'Attendance already recorded for this student today'], 409);
}
$check->close();

// ── Step 5: Mark the token as used ────────────────────────────────────────
$mark = $db->prepare('UPDATE qr_codes SET is_used = 1 WHERE qr_id = ?');
$mark->bind_param('i', $qr_id);
$mark->execute();
$mark->close();

// ── Step 6: Record the attendance ─────────────────────────────────────────
$now    = date('Y-m-d H:i:s');
$status = 'present';
$ins    = $db->prepare(
    'INSERT INTO attendance (student_id, course_id, qr_id, timestamp, status) VALUES (?, ?, ?, ?, ?)'
);
$ins->bind_param('iiiss', $student_id, $course_id, $qr_id, $now, $status);

if (!$ins->execute()) {
    $ins->close();
    $db->close();
    json_response(['error' => 'Could not record attendance: ' . $db->error], 500);
}

$attendance_id = $ins->insert_id;
$ins->close();

// ── Step 7: Fetch student name and roll number ────────────────────────────
$name_stmt = $db->prepare(
    'SELECT u.name, s.roll_number FROM students s JOIN users u ON s.user_id = u.user_id WHERE s.student_id = ?'
);
$name_stmt->bind_param('i', $student_id);
$name_stmt->execute();
$student = $name_stmt->get_result()->fetch_assoc();
$name_stmt->close();

$db->close();

json_response([
    'message'        => 'Attendance recorded successfully',
    'attendance_id'  => $attendance_id,
    'student_id'     => $student_id,
    'student_name'   => $student['name']        ?? null,
    'student_number' => $student['roll_number'] ?? null,
    'course_id'      => $course_id,
    'status'         => $status,
    'scanned_at'     => $now,
], 201);