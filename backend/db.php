<?php
$envPath = __DIR__ . '/../.env';
$env = parse_ini_file($envPath);

if (!$env) {
    die("Error crítico: No se encuentra el archivo de configuración.");
}

$host = $env['DB_HOST'];
$port = $env['DB_PORT'];
$dbname = $env['DB_NAME'];
$user = $env['DB_USER'];
$password = $env['DB_PASS'];

try {
    $dsn = "pgsql:host=$host;port=$port;dbname=$dbname";
    $pdo = new PDO($dsn, $user, $password, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
} catch (PDOException $e) {
    die("Error de conexión a la base de datos."); 
}
?>