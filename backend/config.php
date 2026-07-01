<?php
// Database connection settings
define('DB_HOST', 'localhost');
define('DB_PORT', 3306);
define('DB_NAME', 'attendance_db');
define('DB_USER', 'root');
define('DB_PASS', '');

/**
 * Returns a MySQLi connection. Outputs a JSON error and exits on failure.
 */
function get_db(): mysqli {
    $conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME, DB_PORT);

    if ($conn->connect_error) {
        http_response_code(500);
        echo json_encode(['error' => 'Database connection failed: ' . $conn->connect_error]);
        exit;
    }

    $conn->set_charset('utf8mb4');
    return $conn;
}

/**
 * Sets JSON + CORS headers. Call at the top of every endpoint.
 * $allowed_methods — comma-separated list, e.g. 'GET, POST, DELETE'
 */
function set_headers(string $allowed_methods = 'GET, POST, DELETE'): void {
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: ' . $allowed_methods);
    header('Access-Control-Allow-Headers: Content-Type, Authorization');

    // Pre-flight OPTIONS request — browsers send this before cross-origin POSTs
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

/**
 * Reads the raw JSON request body and decodes it.
 * Returns an associative array, or an empty array if the body is absent/invalid.
 */
function get_json_body(): array {
    $raw = file_get_contents('php://input');
    return $raw ? (json_decode($raw, true) ?? []) : [];
}

/**
 * Sends a JSON response and terminates execution.
 */
function json_response(mixed $data, int $status = 200): never {
    http_response_code($status);
    echo json_encode($data);
    exit;
}
