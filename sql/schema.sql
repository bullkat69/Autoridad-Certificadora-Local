-- ====================================================================
-- ESQUEMA DE BASE DE DATOS PARA AUTORIDAD CERTIFICADORA (PostgreSQL)
-- ====================================================================

-- 1. Tabla para gestionar los códigos de verificación (Pasos 1 y 2)
CREATE TABLE IF NOT EXISTS email_verifications (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    verification_code VARCHAR(6) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_verified BOOLEAN DEFAULT FALSE
);

-- Índice para buscar rápidamente cuando el usuario envíe el código
CREATE INDEX idx_verifications_email ON email_verifications(email);


-- 2. Tabla para el registro histórico de certificados (Paso 3)
CREATE TABLE IF NOT EXISTS issued_certificates (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    serial_number VARCHAR(100) UNIQUE NOT NULL, -- Vital para futuras revocaciones (CRL)
    certificate_pem TEXT NOT NULL,              -- Guardamos una copia del certificado público
    status VARCHAR(20) DEFAULT 'active',        -- Estados: 'active', 'revoked', 'expired'
    issued_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Índices para búsquedas rápidas (por si en el futuro haces un buscador de validez)
CREATE INDEX idx_certificates_email ON issued_certificates(email);
CREATE INDEX idx_certificates_serial ON issued_certificates(serial_number);