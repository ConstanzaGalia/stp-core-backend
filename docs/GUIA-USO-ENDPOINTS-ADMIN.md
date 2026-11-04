# Guía: Cómo Usar los Endpoints Administrativos

## 🔐 Requisitos

Para usar estos endpoints necesitas:
1. ✅ Ser usuario con rol `STP_ADMIN` en la base de datos
2. ✅ Tener un token JWT válido

## 📍 URLs de los Endpoints

Asumiendo que tu API está en `https://api.entrenamientostp.com`:

- **Buscar atleta:** `GET https://api.entrenamientostp.com/athletes/admin/search-by-email?email=EMAIL`
- **Corregir duplicados:** `POST https://api.entrenamientostp.com/athletes/admin/fix-duplicate-invitations`

## 🚀 Formas de Usar

### Opción 1: Postman o Insomnia (Recomendado)

#### Paso 1: Obtener Token JWT

**A) Loguearte con tu usuario STP_ADMIN:**

```
POST https://api.entrenamientostp.com/auth/login
Content-Type: application/json

{
  "email": "tu-email-admin@ejemplo.com",
  "password": "tu-contraseña"
}
```

**Respuesta:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "email": "tu-email-admin@ejemplo.com",
    "role": "stp_admin"
  }
}
```

**Copia el `access_token` de la respuesta.**

#### Paso 2: Buscar Atleta (Diagnóstico)

```
GET https://api.entrenamientostp.com/athletes/admin/search-by-email?email=vickyarmayor@hotmail.com
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Respuesta:**
```json
{
  "found": true,
  "user": {
    "id": "uuid-de-victoria",
    "name": "Victoria",
    "lastName": "Armayor",
    "email": "vickyarmayor@hotmail.com",
    "role": "athlete"
  },
  "invitations": [
    {
      "id": "inv-1",
      "status": "approved",
      "companyId": "uuid-stp-health",
      "companyName": "Stp health and performance",
      "approvedAt": "2024-10-15T10:00:00.000Z"
    },
    {
      "id": "inv-2",
      "status": "approved",
      "companyId": "uuid-sdt",
      "companyName": "sdt",
      "approvedAt": "2024-11-01T12:00:00.000Z"
    }
  ],
  "approvedCount": 2,
  "hasMultipleApproved": true
}
```

#### Paso 3: Corregir Duplicados

**De la respuesta anterior, copia:**
- `user.id` → athleteId
- `companyId` del centro donde debe quedarse → keepCompanyId

```
POST https://api.entrenamientostp.com/athletes/admin/fix-duplicate-invitations
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "athleteId": "uuid-de-victoria",
  "keepCompanyId": "uuid-sdt"
}
```

**Respuesta:**
```json
{
  "fixed": true,
  "message": "Se marcaron 1 invitación(es) como LEFT. El atleta ahora solo está en sdt",
  "updatedInvitations": ["inv-1"]
}
```

---

### Opción 2: cURL (Terminal/Scripts)

#### Buscar Atleta

```bash
# Primero, obtener token
TOKEN=$(curl -s -X POST https://api.entrenamientostp.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"tu-admin@ejemplo.com","password":"tu-pass"}' \
  | jq -r '.access_token')

# Buscar atleta
curl -X GET \
  'https://api.entrenamientostp.com/athletes/admin/search-by-email?email=vickyarmayor@hotmail.com' \
  -H "Authorization: Bearer $TOKEN"
```

#### Corregir Duplicados

```bash
curl -X POST \
  'https://api.entrenamientostp.com/athletes/admin/fix-duplicate-invitations' \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "athleteId": "COPIAR-DEL-PASO-ANTERIOR",
    "keepCompanyId": "COPIAR-DEL-PASO-ANTERIOR"
  }'
```

---

### Opción 3: Desde el Frontend (Si lo integras)

Si quieres agregar esto al panel de administración del frontend:

```typescript
// services/adminAthletes.ts

export const searchAthleteByEmail = async (email: string) => {
  const response = await fetch(
    `${API_URL}/athletes/admin/search-by-email?email=${encodeURIComponent(email)}`,
    {
      headers: {
        'Authorization': `Bearer ${getToken()}`,
      },
    }
  );
  
  if (!response.ok) {
    throw new Error('Error al buscar atleta');
  }
  
  return response.json();
};

export const fixDuplicateInvitations = async (
  athleteId: string,
  keepCompanyId: string
) => {
  const response = await fetch(
    `${API_URL}/athletes/admin/fix-duplicate-invitations`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ athleteId, keepCompanyId }),
    }
  );
  
  if (!response.ok) {
    throw new Error('Error al corregir invitaciones');
  }
  
  return response.json();
};
```

---

### Opción 4: Script Node.js Automatizado

Si necesitas corregir múltiples casos:

```javascript
// fix-victoria.js
const fetch = require('node-fetch');

const API_URL = 'https://api.entrenamientostp.com';
const ADMIN_EMAIL = 'tu-admin@ejemplo.com';
const ADMIN_PASSWORD = 'tu-contraseña';

async function login() {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    }),
  });
  
  const data = await response.json();
  return data.access_token;
}

async function searchAthlete(token, email) {
  const response = await fetch(
    `${API_URL}/athletes/admin/search-by-email?email=${encodeURIComponent(email)}`,
    {
      headers: { 'Authorization': `Bearer ${token}` },
    }
  );
  
  return response.json();
}

async function fixDuplicates(token, athleteId, keepCompanyId) {
  const response = await fetch(
    `${API_URL}/athletes/admin/fix-duplicate-invitations`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ athleteId, keepCompanyId }),
    }
  );
  
  return response.json();
}

// Uso
(async () => {
  console.log('🔐 Logueando...');
  const token = await login();
  
  console.log('🔍 Buscando a Victoria...');
  const result = await searchAthlete(token, 'vickyarmayor@hotmail.com');
  
  if (result.hasMultipleApproved) {
    console.log('⚠️  Victoria tiene múltiples invitaciones APPROVED');
    console.log('Centros:', result.invitations.map(i => i.companyName));
    
    // Buscar el ID del centro "sdt"
    const sdtInvitation = result.invitations.find(
      inv => inv.companyName.toLowerCase() === 'sdt'
    );
    
    if (sdtInvitation) {
      console.log('🔧 Corrigiendo...');
      const fixed = await fixDuplicates(
        token,
        result.user.id,
        sdtInvitation.companyId
      );
      console.log('✅', fixed.message);
    }
  } else {
    console.log('✅ Victoria no tiene invitaciones duplicadas');
  }
})();
```

Ejecutar:
```bash
node fix-victoria.js
```

---

## 🔒 Verificar tu Usuario es STP_ADMIN

### Consulta SQL en la Base de Datos

```sql
-- Ver tu rol
SELECT id, email, role 
FROM "user" 
WHERE email = 'tu-email@ejemplo.com';

-- Si necesitas cambiarlo a STP_ADMIN
UPDATE "user" 
SET role = 'stp_admin' 
WHERE email = 'tu-email@ejemplo.com';
```

---

## 🚨 Errores Comunes

### Error 403: Forbidden

```json
{
  "statusCode": 403,
  "message": "Solo los administradores pueden buscar atletas por email"
}
```

**Causa:** Tu usuario NO tiene rol `STP_ADMIN`

**Solución:** Actualizar el rol en la base de datos (ver consulta SQL arriba)

### Error 401: Unauthorized

```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

**Causa:** Token JWT inválido o expirado

**Solución:** Volver a hacer login y obtener un nuevo token

### Error 400: Bad Request

```json
{
  "statusCode": 400,
  "message": "El parámetro email es requerido"
}
```

**Causa:** Falta el parámetro en la petición

**Solución:** Verificar que estás enviando todos los parámetros requeridos

---

## 📊 Caso Práctico: Corregir Victoria

### Paso a Paso Completo

```bash
# 1. Login (guarda el token)
curl -X POST https://api.entrenamientostp.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@stp.com","password":"tu-password"}' \
  > /tmp/login.json

# Extraer token
TOKEN=$(cat /tmp/login.json | jq -r '.access_token')

# 2. Buscar Victoria
curl -X GET \
  "https://api.entrenamientostp.com/athletes/admin/search-by-email?email=vickyarmayor@hotmail.com" \
  -H "Authorization: Bearer $TOKEN" \
  > /tmp/victoria.json

# Ver resultado
cat /tmp/victoria.json | jq '.'

# 3. Corregir (reemplaza los UUIDs con los del paso 2)
curl -X POST \
  'https://api.entrenamientostp.com/athletes/admin/fix-duplicate-invitations' \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "athleteId": "COPIAR-user.id",
    "keepCompanyId": "COPIAR-companyId-de-sdt"
  }' | jq '.'
```

---

## 💡 Recomendación

Para uso frecuente, crea un **script bash** o **panel en el frontend** para que no tengas que copiar/pegar tokens manualmente cada vez.

¿Necesitas ayuda con alguna de estas opciones?
