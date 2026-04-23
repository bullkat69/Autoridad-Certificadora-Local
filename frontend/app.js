// URL del backend PHP
const BACKEND_URL = "../backend/generate-cert.php";

// Estado global de la sesión
const state = {
    email: null,
    keyPair: null,      // { publicKey, privateKey } Web Crypto
    forgeKeyPair: null, // par forge para CSR
    certPem: null,
};

// ---- Referencias al DOM ----
const steps = {
    email:    document.getElementById("step-email"),
    verify:   document.getElementById("step-verify"),
    generate: document.getElementById("step-generate"),
    done:     document.getElementById("step-done"),
};

const emailInput    = document.getElementById("input-email");
const emailBtn      = document.getElementById("btn-send-email");
const emailError    = document.getElementById("error-email");

const codeInput     = document.getElementById("input-code");
const codeBtn       = document.getElementById("btn-verify-code");
const codeError     = document.getElementById("error-code");
const resendBtn     = document.getElementById("btn-resend");

const generateBtn   = document.getElementById("btn-generate");
const generateInfo  = document.getElementById("generate-info");
const generateError = document.getElementById("error-generate");

const p12Password   = document.getElementById("input-p12-password");
const p12Confirm    = document.getElementById("input-p12-confirm");

const doneSummary   = document.getElementById("done-summary");

// ---- Navegación entre pasos ----
function showStep(name) {
    Object.values(steps).forEach(s => s.classList.add("hidden"));
    steps[name].classList.remove("hidden");
}

// ---- Utilidades UI ----
function setLoading(btn, loading, defaultText) {
    btn.disabled = loading;
    btn.textContent = loading ? "Cargando…" : defaultText;
}

function showError(el, msg) {
    el.textContent = msg;
    el.classList.remove("hidden");
}

function clearError(el) {
    el.textContent = "";
    el.classList.add("hidden");
}

// ---- PASO 1: Enviar email ----
emailBtn.addEventListener("click", async () => {
    clearError(emailError);
    const email = emailInput.value.trim();

    if (!isValidEmail(email)) {
        showError(emailError, "Introduce un email válido.");
        return;
    }

    setLoading(emailBtn, true, "Enviar código");
    try {
        const res = await fetch(BACKEND_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "send_code", email }),
        });
        const data = await res.json();

        if (data.success) {
            state.email = email;
            document.getElementById("verify-email-display").textContent = email;
            showStep("verify");
        } else {
            showError(emailError, data.error || "Error al enviar el código.");
        }
    } catch (e) {
        showError(emailError, "No se pudo contactar con el servidor.");
    } finally {
        setLoading(emailBtn, false, "Enviar código");
    }
});

// ---- PASO 2: Verificar código ----
codeBtn.addEventListener("click", async () => {
    clearError(codeError);
    const code = codeInput.value.trim();

    if (code.length < 4) {
        showError(codeError, "Introduce el código recibido.");
        return;
    }

    setLoading(codeBtn, true, "Verificar");
    try {
        const res = await fetch(BACKEND_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "verify_code", email: state.email, code }),
        });
        const data = await res.json();

        if (data.success) {
            document.getElementById("generate-email-display").textContent = state.email;
            showStep("generate");
        } else {
            showError(codeError, data.error || "Código incorrecto.");
        }
    } catch (e) {
        showError(codeError, "No se pudo contactar con el servidor.");
    } finally {
        setLoading(codeBtn, false, "Verificar");
    }
});

// Reenviar código
resendBtn.addEventListener("click", async () => {
    resendBtn.disabled = true;
    resendBtn.textContent = "Reenviando…";
    try {
        await fetch(BACKEND_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "send_code", email: state.email }),
        });
        resendBtn.textContent = "Código reenviado";
        setTimeout(() => {
            resendBtn.disabled = false;
            resendBtn.textContent = "Reenviar código";
        }, 30000);
    } catch (e) {
        resendBtn.disabled = false;
        resendBtn.textContent = "Reenviar código";
    }
});

// ---- PASO 3: Generar claves y obtener certificado ----
generateBtn.addEventListener("click", async () => {
    clearError(generateError);

    const password = p12Password.value;
    const confirm  = p12Confirm.value;

    if (password.length < 4) {
        showError(generateError, "La contraseña debe tener al menos 4 caracteres.");
        return;
    }
    if (password !== confirm) {
        showError(generateError, "Las contraseñas no coinciden.");
        return;
    }

    setLoading(generateBtn, true, "Generar y Descargar");
    generateInfo.textContent = "Generando par de claves RSA-2048…";
    generateInfo.classList.remove("hidden");

    try {
        // 1. Generar claves en el cliente
        state.keyPair = await generateKeyPair();

        // 2. Convertir clave privada a forge para poder hacer el CSR
        generateInfo.textContent = "Creando solicitud de certificado (CSR)…";
        const forgePrivKey = await webCryptoPrivateKeyToForge(state.keyPair.privateKey);
        const forgePubKey  = await webCryptoPublicKeyToForge(state.keyPair.publicKey);
        const forgeKP = { privateKey: forgePrivKey, publicKey: forgePubKey };

        // 3. Generar CSR
        const csrPem = generateCSR(state.email, forgeKP);

        // 4. Enviar CSR al servidor (solo la clave pública viaja al backend)
        generateInfo.textContent = "Enviando clave pública al servidor…";
        const res = await fetch(BACKEND_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "issue_cert", email: state.email, csr: csrPem }),
        });
        const data = await res.json();

        if (!data.success) {
            showError(generateError, data.error || "Error al emitir el certificado.");
            return;
        }

        state.certPem = data.certificate;

        // 5. Crear el p12 en el cliente con la clave privada + certificado
        generateInfo.textContent = "Creando archivo .p12…";
        const p12Bytes = await createP12(state.keyPair.privateKey, state.certPem, password);

        // 6. Descargar
        const filename = `certificado_${state.email.replace("@", "_at_")}.p12`;
        downloadP12(p12Bytes, filename);

        // 7. Mostrar pantalla de éxito
        doneSummary.innerHTML = `
            <p>Certificado emitido para <strong>${state.email}</strong>.</p>
            <p>El archivo <code>${filename}</code> se ha descargado en tu equipo.</p>
            <p>Impórtalo en tu cliente de correo usando la contraseña que elegiste.</p>
        `;
        showStep("done");

    } catch (e) {
        console.error(e);
        showError(generateError, "Error durante la generación: " + e.message);
    } finally {
        setLoading(generateBtn, false, "Generar y Descargar");
        generateInfo.classList.add("hidden");
    }
});

// ---- Reiniciar flujo ----
document.getElementById("btn-restart")?.addEventListener("click", () => {
    state.email = null;
    state.keyPair = null;
    state.certPem = null;
    emailInput.value = "";
    codeInput.value = "";
    p12Password.value = "";
    p12Confirm.value = "";
    showStep("email");
});

// ---- Helpers ----
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ---- Init ----
showStep("email");