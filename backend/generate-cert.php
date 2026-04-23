<?php

// 1. Configuramos las cabeceras para aceptar JSON y devolver JSON
header('Content-Type: application/json; charset=utf-8');

// 2. Importamos la conexión a la base de datos
require_once 'db.php'; 

// Importamos las clases de PHPMailer
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

// Cargamos el autoloader de Composer
require_once __DIR__ . '/../vendor/autoload.php';

// 3. Leemos el cuerpo de la petición (app.js envía un JSON, no un formulario normal)
$inputJSON = file_get_contents('php://input');
$data = json_decode($inputJSON, true);

// 4. Extraemos la acción y el email (comunes a todas las peticiones)
$action = $data['action'] ?? '';
$email = $data['email'] ?? '';

// Validamos el formato del email por seguridad
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    echo json_encode(['success' => false, 'error' => 'Formato de correo inválido.']);
    exit;
}



switch ($action) {

    
    case 'send_code':
        $code = str_pad(rand(0, 999999), 6, '0', STR_PAD_LEFT);
        
        $stmtDelete = $pdo->prepare("DELETE FROM email_verifications WHERE email = ?");
        $stmtDelete->execute([$email]);

        // Insertamos en BBDD
        $stmtInsert = $pdo->prepare("INSERT INTO email_verifications (email, verification_code, expires_at) 
                                     VALUES (?, ?, NOW() + INTERVAL '15 minutes')");
        $stmtInsert->execute([$email, $code]);

        // --- INICIO ENVÍO DE CORREO ---
        $mail = new PHPMailer(true);
        try {
            // Configuración del servidor SMTP
            $mail->isSMTP();
            $mail->Host       = 'smtp.gmail.com'; 
            $mail->SMTPAuth   = true;
            // Leemos el usuario y contraseña del archivo .env a través de la variable $env que viene de db.php
            $mail->Username   = $env['SMTP_USER']; 
            $mail->Password   = $env['SMTP_PASS'];
            $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
            $mail->Port       = 587;

            // Remitente y Destinatario
            $mail->setFrom($env['SMTP_USER'], 'Autoridad Certificadora Local');
            $mail->addAddress($email);

            // Contenido del correo
            $mail->isHTML(true);
            $mail->Subject = 'Tu codigo de verificacion para el Certificado';
            $mail->Body    = "<div style='font-family: sans-serif; padding: 20px;'>
                                <h2>Generación de Certificado .p12</h2>
                                <p>Tu código de seguridad de un solo uso es:</p>
                                <h1 style='color: #0056b3; letter-spacing: 5px;'>{$code}</h1>
                                <p><i>Este código caducará en 15 minutos. Si no has solicitado esto, ignora este correo.</i></p>
                              </div>";

            $mail->send();

            // Respuesta de éxito al frontend (ya no enviamos el debug_code)
            echo json_encode(['success' => true]);

        } catch (Exception $e) {
            // Si el correo falla, borramos el código de la BBDD para no dejar basura
            $stmtDelete->execute([$email]);
            error_log("Error de PHPMailer: {$mail->ErrorInfo}");
            echo json_encode(['success' => false, 'error' => 'No se pudo enviar el correo de verificación.']);
        }
        break;

    
    case 'verify_code':
        $code = $data['code'] ?? '';

        // Buscamos si existe un registro válido, no caducado y no verificado
        $stmt = $pdo->prepare("SELECT id FROM email_verifications WHERE email = ? AND verification_code = ? AND expires_at > NOW() AND is_verified = FALSE");
        $stmt->execute([$email, $code]);
        $row = $stmt->fetch();

        if ($row) {
            // Marcamos como verificado
            $stmtUpdate = $pdo->prepare("UPDATE email_verifications SET is_verified = TRUE WHERE id = ?");
            $stmtUpdate->execute([$row['id']]);
            echo json_encode(['success' => true]);
        } else {
            echo json_encode(['success' => false, 'error' => 'El código es incorrecto o ha caducado.']);
        }
        break;

    
    case 'issue_cert':
        $csrPem = $data['csr'] ?? '';

        if (empty($csrPem)) {
            echo json_encode(['success' => false, 'error' => 'No se recibió la solicitud CSR.']);
            exit;
        }

        // 1. Comprobación de seguridad VITAL: ¿Está el email verificado y dentro del tiempo de validez?
        $stmtCheck = $pdo->prepare("SELECT id FROM email_verifications WHERE email = ? AND is_verified = TRUE AND expires_at > NOW()");
        $stmtCheck->execute([$email]);
        if (!$stmtCheck->fetch()) {
            echo json_encode(['success' => false, 'error' => 'Validación de email ausente o caducada.']);
            exit;
        }

        // 2. Cargamos las credenciales de nuestra Autoridad Certificadora (CA)
        $caCertPath = __DIR__ . '/ca/ca.crt';
        $caKeyPath  = __DIR__ . '/ca/ca.key';

        if (!file_exists($caCertPath) || !file_exists($caKeyPath)) {
            error_log("Error crítico: No se encuentran los archivos de la CA.");
            echo json_encode(['success' => false, 'error' => 'Error interno en la PKI del servidor.']);
            exit;
        }

        $caCert = file_get_contents($caCertPath);
        $caKey  = file_get_contents($caKeyPath); 

        // 3. Generamos un número de serie único basado en el tiempo exacto (microsegundos)
        $serialNumber = (string) microtime(true) * 10000;
        
        // 4. Firmamos el CSR para convertirlo en un certificado válido (Validez: 1 año = 365 días)
        // Pasamos tu archivo openssl.cnf para que aplique tus políticas.
        $userCertResource = openssl_csr_sign($csrPem, $caCert, $caKey, 365, [
            'config' => __DIR__ . '/openssl.cnf',
            'digest_alg' => 'sha256'
        ], $serialNumber);

        if (!$userCertResource) {
            error_log("Error de OpenSSL: " . openssl_error_string());
            echo json_encode(['success' => false, 'error' => 'Fallo al firmar criptográficamente el certificado.']);
            exit;
        }

        // Extraemos el certificado en formato texto (PEM)
        openssl_x509_export($userCertResource, $userCertPem);

        // 5. Guardamos el certificado en la base de datos para el histórico
        $expiresCert = date('Y-m-d H:i:s', strtotime('+365 days'));
        $stmtInsertCert = $pdo->prepare("INSERT INTO issued_certificates (email, serial_number, certificate_pem, expires_at) VALUES (?, ?, ?, ?)");
        $stmtInsertCert->execute([$email, $serialNumber, $userCertPem, $expiresCert]);

        // 6. Invalidadmos la verificación para que no puedan reusar la misma sesión para otro cert
        $stmtClean = $pdo->prepare("DELETE FROM email_verifications WHERE email = ?");
        $stmtClean->execute([$email]);

        // 7. Devolvemos el certificado firmado al cliente (app.js)
        echo json_encode([
            'success' => true,
            'certificate' => $userCertPem
        ]);
        break;

    default:
        echo json_encode(['success' => false, 'error' => 'Acción no reconocida.']);
        break;
}
?>