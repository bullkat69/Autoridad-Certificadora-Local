/**
 * Genera un par de claves RSA-2048 usando Web Crypto API.
 * Devuelve { publicKey, privateKey } como objetos CryptoKey.
 */
async function generateKeyPair() {
    const keyPair = await window.crypto.subtle.generateKey(
        {
            name: "RSASSA-PKCS1-v1_5",
            modulusLength: 2048,
            publicExponent: new Uint8Array([0x01, 0x00, 0x01]), // 65537
            hash: "SHA-256",
        },
        true, // exportable
        ["sign", "verify"]
    );
    return keyPair;
}

/**
 * Exporta la clave pública en formato PEM (SPKI).
 */
async function exportPublicKeyPEM(publicKey) {
    const spki = await window.crypto.subtle.exportKey("spki", publicKey);
    const b64 = arrayBufferToBase64(spki);
    return `-----BEGIN PUBLIC KEY-----\n${chunkBase64(b64)}\n-----END PUBLIC KEY-----`;
}

/**
 * Exporta la clave privada en formato PEM (PKCS8).
 */
async function exportPrivateKeyPEM(privateKey) {
    const pkcs8 = await window.crypto.subtle.exportKey("pkcs8", privateKey);
    const b64 = arrayBufferToBase64(pkcs8);
    return `-----BEGIN PRIVATE KEY-----\n${chunkBase64(b64)}\n-----END PRIVATE KEY-----`;
}

/**
 * Genera un CSR (Certificate Signing Request) usando node-forge.
 * @param {string} email - Dirección de correo electrónico del solicitante
 * @param {forge.pki.rsa.KeyPair} forgeKeyPair - Par de claves forge
 * @returns {string} CSR en formato PEM
 */
function generateCSR(email, forgeKeyPair) {
    const csr = forge.pki.createCertificationRequest();
    csr.publicKey = forgeKeyPair.publicKey;

    csr.setSubject([
        { name: "commonName", value: email },
        { name: "emailAddress", value: email },
    ]);

    // SAN (Subject Alternative Name) con el email
    csr.setAttributes([{
        name: "extensionRequest",
        extensions: [{
            name: "subjectAltName",
            altNames: [{ type: 1, value: email }] // type 1 = rfc822Name (email)
        }]
    }]);

    csr.sign(forgeKeyPair.privateKey, forge.md.sha256.create());
    return forge.pki.certificationRequestToPem(csr);
}

/**
 * Convierte una clave privada Web Crypto a forge.
 */
async function webCryptoPrivateKeyToForge(privateKey) {
    const pkcs8 = await window.crypto.subtle.exportKey("pkcs8", privateKey);
    const pem = `-----BEGIN PRIVATE KEY-----\n${chunkBase64(arrayBufferToBase64(pkcs8))}\n-----END PRIVATE KEY-----`;
    return forge.pki.privateKeyFromPem(pem);
}

/**
 * Convierte una clave pública Web Crypto a forge.
 */
async function webCryptoPublicKeyToForge(publicKey) {
    const spki = await window.crypto.subtle.exportKey("spki", publicKey);
    const pem = `-----BEGIN PUBLIC KEY-----\n${chunkBase64(arrayBufferToBase64(spki))}\n-----END PUBLIC KEY-----`;
    return forge.pki.publicKeyFromPem(pem);
}

/**
 * Crea un archivo .p12 (PKCS#12) con la clave privada y el certificado recibido.
 * @param {CryptoKey} privateKey - Clave privada Web Crypto
 * @param {string} certPem - Certificado en PEM recibido del servidor
 * @param {string} password - Contraseña para proteger el p12
 * @returns {Uint8Array} Bytes del archivo .p12
 */
async function createP12(privateKey, certPem, password) {
    const forgePrivKey = await webCryptoPrivateKeyToForge(privateKey);
    const forgeCert = forge.pki.certificateFromPem(certPem);

    const p12Asn1 = forge.pkcs12.toPkcs12Asn1(
        forgePrivKey,
        [forgeCert],
        password,
        {
            algorithm: "3des",
            friendlyName: forgeCert.subject.getField("CN").value,
        }
    );

    const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
    return stringToUint8Array(p12Der);
}

/**
 * Dispara la descarga del archivo .p12 en el navegador.
 */
function downloadP12(uint8Array, filename = "certificado.p12") {
    const blob = new Blob([uint8Array], { type: "application/x-pkcs12" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ---- Utilidades ----

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

function chunkBase64(b64, lineLength = 64) {
    return b64.match(/.{1,64}/g).join("\n");
}

function stringToUint8Array(str) {
    const arr = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
        arr[i] = str.charCodeAt(i);
    }
    return arr;
}