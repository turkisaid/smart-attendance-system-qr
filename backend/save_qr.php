<?php
ini_set('display_errors', 0);
error_reporting(0);
header('Content-Type: application/json');

require_once 'config.php';

set_headers('POST');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['error' => 'Method not allowed'], 405);
}

$body       = get_json_body();
$student_id = isset($body['student_id']) ? (int) $body['student_id'] : 0;
$course_id  = isset($body['course_id'])  ? (int) $body['course_id']  : 0;
$token      = trim($body['token']  ?? '');
$nonce      = trim($body['nonce']  ?? '');
$expiry     = isset($body['expiry']) ? (int) $body['expiry'] : 0;

if ($student_id <= 0 || $course_id <= 0 || $token === '' || $nonce === '' || $expiry <= 0) {
    json_response(['error' => 'Missing required fields'], 400);
}

$db = get_db();
$expiry_time = date('Y-m-d H:i:s', $expiry);

$stmt = $db->prepare(
    'INSERT INTO qr_codes (student_id, course_id, token, nonce, expiry_time, is_used) VALUES (?, ?, ?, ?, ?, 0)'
);
$stmt->bind_param('iisss', $student_id, $course_id, $token, $nonce, $expiry_time);

if (!$stmt->execute()) {
    $stmt->close();
    $db->close();
    json_response(['error' => 'Could not save QR token'], 500);
}

$stmt->close();
$db->close();

json_response(['success' => true], 201);
