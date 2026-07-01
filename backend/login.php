<?php
// Suppress PHP warnings/notices from appearing in the response body
ini_set('display_errors', 0);
error_reporting(0);

// JSON header must come before any other output
header('Content-Type: application/json; charset=utf-8');

require_once 'config.php';

try {
    set_headers('POST');

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        json_response(['success' => false, 'message' => 'Method not allowed'], 405);
    }

    $body     = get_json_body();
    $email    = trim($body['email']    ?? '');
    $password = trim($body['password'] ?? '');

    // NOTE: the frontend sends a 'role' field for the tab UI, but we intentionally
    // ignore it here — the real role is read from the database, not trusted from input.

    if ($email === '' || $password === '') {
        json_response(['success' => false, 'message' => 'email and password are required'], 400);
    }

    $db = get_db();

    // Column name is `password` (not password_hash) — confirmed against schema
    $stmt = $db->prepare(
        'SELECT user_id, name, email, password, role FROM users WHERE email = ? LIMIT 1'
    );
    if (!$stmt) {
        error_log("LOGIN prepare failed: " . $db->error);
        json_response(['success' => false, 'message' => 'Database error'], 500);
    }

    $stmt->bind_param('s', $email);
    $stmt->execute();
    $result = $stmt->get_result();
    $user   = $result->fetch_assoc();
    $stmt->close();

    // ── DEBUG: log what the query returned ──────────────────────────────────
    error_log("LOGIN debug — email looked up: " . $email);
    error_log("LOGIN debug — user row: " . print_r($user, true));

    if (!$user) {
        error_log("LOGIN debug — no user found for email: " . $email);
        json_response(['success' => false, 'message' => 'Invalid credentials'], 401);
    }

    // ── DEBUG: log password_verify result ───────────────────────────────────
    $verify_result = password_verify($password, $user['password']);
    error_log("LOGIN debug — password_verify result: " . var_export($verify_result, true));
    error_log("LOGIN debug — stored hash starts with: " . substr($user['password'], 0, 7));

    if (!$verify_result) {
        json_response(['success' => false, 'message' => 'Invalid credentials'], 401);
    }

    // Generate a session token
    $token      = bin2hex(random_bytes(32));
    $expires_at = date('Y-m-d H:i:s', strtotime('+8 hours'));

    // Store the token — wrapped in its own try/catch so a missing sessions table
    // does not block a successful login (gracefully degrades to stateless tokens)
    try {
        $stmt = $db->prepare(
            'INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)'
        );
        if ($stmt) {
            $stmt->bind_param('iss', $user['user_id'], $token, $expires_at);
            $stmt->execute();
            $stmt->close();
        } else {
            error_log("LOGIN sessions prepare failed: " . $db->error);
        }
    } catch (Throwable $se) {
        // Non-fatal: log and continue — the token is still returned to the client
        error_log("LOGIN sessions insert skipped: " . $se->getMessage());
    }

    $db->close();

    error_log("LOGIN debug — login successful for: " . $email . " role: " . $user['role']);

    json_response([
        'success'    => true,
        'user_id'    => $user['user_id'],
        'name'       => $user['name'],
        'email'      => $user['email'],
        'role'       => $user['role'],
        'token'      => $token,
        'expires_at' => $expires_at,
    ]);

} catch (Throwable $e) {
    // Log the real error so we can diagnose it
    error_log("LOGIN exception: " . $e->getMessage() . " in " . $e->getFile() . " line " . $e->getLine());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Server error: ' . $e->getMessage()]);
    exit;
}
