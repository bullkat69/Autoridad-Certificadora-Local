<?php
header('Content-Type: application/json; charset=utf-8');
require_once 'db.php';


$adminKey = $_GET['key'] ?? '';

if (empty($adminKey) || $adminKey !== $env['ADMIN_KEY']) {
    http_response_code(401);
    echo json_encode(['error' => 'No autorizado']);
    exit;
}

$action = $_GET['action'] ?? 'list_certs';

try {
    if ($action === 'list_certs') {
        // Obtenemos los certificados emitidos
        $stmt = $pdo->query("SELECT id, email, serial_number, issued_at, expires_at FROM issued_certificates ORDER BY issued_at DESC");
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    } 
    elseif ($action === 'list_pending') {
        // Verificamos quién está intentando validar su email ahora mismo
        $stmt = $pdo->query("SELECT email, expires_at, is_verified FROM email_verifications ORDER BY expires_at DESC");
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    }
} catch (PDOException $e) {
    echo json_encode(['error' => 'Error en la base de datos']);
}