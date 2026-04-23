# 🔐 Sistema de Autoridad Certificadora (CA) Local

Este proyecto es una aplicación web que simula una Entidad Certificadora. Permite verificar correos, generar llaves RSA en el cliente y obtener certificados X.509 firmados por una CA propia.

## 🛠️ Requisitos previos

Antes de empezar, asegúrate de tener instalado en tu sistema:
- **PHP 8.x** (con extensiones `openssl`, `pdo_pgsql` y `mbstring` activas).
- **PostgreSQL** y un usuario con permisos para crear tablas.
- **Composer** (Gestor de dependencias de PHP).
- **OpenSSL** (Accesible desde la línea de comandos).

---

## 🚀 Guía de Instalación y Configuración

Sigue estos pasos en orden para desplegar la aplicación en tu entorno local:

### 1. Clonar y preparar carpetas
Una vez descargado el proyecto, asegúrate de crear la carpeta para las llaves de la CA:
```bash
mkdir -p backend/ca
```

### 2. Instalar dependencias (PHPMailer)
Desde la raíz del proyecto ejecuta:
```bash
composer install
```
Esto creará la carpeta vendor/ con todas las librerias necesarias

### 3. Configurar la Base de Datos
Crea una base de datos en PostgreSQL (ej: 'ca_db')

Importa el esquema inicial
```bash
psql -U tu_usuario -d ca_db -f sql/schema.sql
```

### 4. Variables de Entorno
Copia el archivo de ejemplo y editalo con tus credenciales reales:
```bash
cp .env.example .env
```
Nota: Es imprescindible configurar el SMTP_PASS(Contraseña de Aplicación de Gmail)
para que el envio de codigos funcione

### 5. Generar las llaves maestras de la CA
```bash
#Generar Clave privada
openssl genrsa -out backend/ca/ca.key 2048

#Generar certificado de la CA (Rellena los datos de identidad que pida)
openssl req -x509 -new -nodes -key backend/ca/ca.key -sha256 -days 365 -out backend/ca/ca.crt
```

## Ejecución del Servidor

Para evitar problemas con las rutas relativas de los scripts, es fundamental levantar el servidor desde la raíz del proyecto:

Abre el terminal en la carpeta principal Autoridad_Certificadora

Ejecuta el servidor integrado de PHP:

```bash
php -S localhost:8000
```

Acceso a la aplicación:

**Portal de Usuario**: http://localhost:8000/frontend/index.html

**Panel de Control**: http://localhost:8000/frontend/admin.html?key=ADMIN_KEY  -> ADMIN_KEY del .env


### 🛠️ Solución de problemas comunes

**Error 404 en la API**: Asegúrate de que el servidor se ha lanzado desde la raíz y no desde dentro de la carpeta frontend.

**Certificado no abre en Windows**: Recuerda que al descargar el .p12, debes usar la contraseña que elegiste durante la generación en la web

**Error de conexión DB**: Revisa que el servicio de PostgreSQL esté corriendo y que los datos en el .env sean correctos.

#### Levantar Servidor PostgreSQL:

```bash
sudo systemctl start postgresql
```

#### Parar y Deshabilitar Servidor PostgreSQL:

```bash
sudo systemctl stop postgresql

sudo systemctl disable postgresql
```



