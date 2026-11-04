# Guía: Corregir Invitaciones Duplicadas de Atletas

## Problema

Un atleta puede tener múltiples invitaciones con estado `APPROVED` simultáneamente, lo que causa que aparezca en múltiples centros a la vez. Esto puede ocurrir si el proceso de cambio de centro no se completó correctamente.

### Síntomas:
- Un atleta aparece en el roster de un centro del cual ya se fue
- El atleta tiene múltiples centros en "Mis Centros"
- Confusión sobre dónde está inscrito realmente el atleta

## Solución

Se han implementado dos endpoints administrativos para diagnosticar y corregir este problema:

### 1. Diagnosticar el problema

**Endpoint:** `GET /athletes/admin/search-by-email?email=<email>`

**Requisitos:** 
- Token JWT de un usuario con rol `STP_ADMIN`

**Ejemplo con cURL:**

```bash
curl -X GET \
  'https://tu-api.com/athletes/admin/search-by-email?email=vickyarmayor@hotmail.com' \
  -H 'Authorization: Bearer TU_TOKEN_JWT'
```

**Respuesta exitosa:**

```json
{
  "found": true,
  "user": {
    "id": "uuid-del-usuario",
    "name": "Victoria",
    "lastName": "Armayor",
    "email": "vickyarmayor@hotmail.com",
    "role": "athlete"
  },
  "invitations": [
    {
      "id": "uuid-invitacion-1",
      "status": "approved",
      "companyId": "uuid-stp-health",
      "companyName": "Stp health and performance",
      "isOnline": false,
      "approvedAt": "2024-10-15T10:00:00.000Z",
      "createdAt": "2024-10-15T09:30:00.000Z",
      "updatedAt": "2024-10-15T10:00:00.000Z"
    },
    {
      "id": "uuid-invitacion-2",
      "status": "approved",
      "companyId": "uuid-sdt",
      "companyName": "sdt",
      "isOnline": false,
      "approvedAt": "2024-11-01T12:00:00.000Z",
      "createdAt": "2024-11-01T11:30:00.000Z",
      "updatedAt": "2024-11-01T12:00:00.000Z"
    }
  ],
  "approvedCount": 2,
  "hasMultipleApproved": true
}
```

### 2. Corregir el problema

**Endpoint:** `POST /athletes/admin/fix-duplicate-invitations`

**Requisitos:**
- Token JWT de un usuario con rol `STP_ADMIN`

**Body:**
```json
{
  "athleteId": "uuid-del-usuario",
  "keepCompanyId": "uuid-del-centro-donde-quedará"
}
```

**Ejemplo con cURL:**

```bash
curl -X POST \
  'https://tu-api.com/athletes/admin/fix-duplicate-invitations' \
  -H 'Authorization: Bearer TU_TOKEN_JWT' \
  -H 'Content-Type: application/json' \
  -d '{
    "athleteId": "uuid-del-usuario",
    "keepCompanyId": "uuid-sdt"
  }'
```

**Respuesta exitosa:**

```json
{
  "fixed": true,
  "message": "Se marcaron 1 invitación(es) como LEFT. El atleta ahora solo está en sdt",
  "updatedInvitations": ["uuid-invitacion-1"]
}
```

## Proceso Completo

### Paso 1: Diagnosticar

```bash
# 1. Buscar al atleta por email
curl -X GET \
  'https://tu-api.com/athletes/admin/search-by-email?email=vickyarmayor@hotmail.com' \
  -H 'Authorization: Bearer TU_TOKEN_JWT'
```

Esto te mostrará:
- ✅ Cuántas invitaciones tiene el atleta
- ✅ Cuáles están activas (APPROVED)
- ✅ Los IDs necesarios para la corrección

### Paso 2: Identificar el centro correcto

De la respuesta del Paso 1, anota:
- `user.id` → El ID del atleta
- `companyId` del centro donde debe quedarse (en este caso, "sdt")

### Paso 3: Aplicar la corrección

```bash
# 2. Corregir las invitaciones duplicadas
curl -X POST \
  'https://tu-api.com/athletes/admin/fix-duplicate-invitations' \
  -H 'Authorization: Bearer TU_TOKEN_JWT' \
  -H 'Content-Type: application/json' \
  -d '{
    "athleteId": "COPIAR-user-id-DEL-PASO-1",
    "keepCompanyId": "COPIAR-companyId-DE-sdt"
  }'
```

### Paso 4: Verificar

```bash
# 3. Volver a buscar para confirmar
curl -X GET \
  'https://tu-api.com/athletes/admin/search-by-email?email=vickyarmayor@hotmail.com' \
  -H 'Authorization: Bearer TU_TOKEN_JWT'
```

Ahora deberías ver:
- ✅ `approvedCount: 1`
- ✅ `hasMultipleApproved: false`
- ✅ Las invitaciones antiguas con `status: "left"`

## Caso: Victoria (vickyarmayor@hotmail.com)

Según el reporte:
- ❌ **Problema:** Victoria aparece en "Stp health and performance" pero se cambió a "sdt"
- ✅ **Solución:** Mantener solo la invitación en "sdt", marcar "Stp health and performance" como LEFT

### Comandos específicos:

```bash
# 1. Diagnóstico
curl -X GET \
  'https://tu-api.com/athletes/admin/search-by-email?email=vickyarmayor@hotmail.com' \
  -H 'Authorization: Bearer TU_TOKEN_ADMIN'

# 2. Anotar los IDs de la respuesta:
# - user.id
# - companyId de "sdt"

# 3. Corrección (reemplazar los UUIDs con los valores reales del paso 1)
curl -X POST \
  'https://tu-api.com/athletes/admin/fix-duplicate-invitations' \
  -H 'Authorization: Bearer TU_TOKEN_ADMIN' \
  -H 'Content-Type: application/json' \
  -d '{
    "athleteId": "UUID_DE_VICTORIA",
    "keepCompanyId": "UUID_DE_SDT"
  }'
```

## ¿Qué hace exactamente la corrección?

Cuando ejecutas `fix-duplicate-invitations`, el sistema:

1. ✅ Verifica que el atleta tenga múltiples invitaciones APPROVED
2. ✅ Confirma que existe una invitación APPROVED en el centro especificado
3. ✅ Marca todas las demás invitaciones APPROVED como `LEFT`
4. ✅ Actualiza la fecha `leftAt` en esas invitaciones
5. ✅ Remueve al atleta de la tabla `company_users` de esos centros
6. ✅ Deja intacta la invitación del centro especificado

**Resultado:** El atleta queda activo solo en el centro correcto.

## Prevención

Para evitar este problema en el futuro:

1. Cuando un atleta se cambia de centro, usar el endpoint `PUT /athletes/:companyId/leave` antes de crear la nueva invitación
2. O usar `DELETE /athletes/company/:companyId/athletes/:athleteId` desde el panel del centro anterior
3. Los administradores pueden usar este endpoint de corrección ante cualquier inconsistencia

## Notas de seguridad

- ⚠️ Estos endpoints solo funcionan con token de `STP_ADMIN`
- ⚠️ La corrección es permanente (marca invitaciones como LEFT)
- ⚠️ Siempre ejecuta el diagnóstico primero antes de corregir
- ⚠️ Verifica los IDs dos veces antes de ejecutar la corrección

## Script alternativo (con acceso directo a BD)

Si tienes acceso directo a la base de datos PostgreSQL, también puedes usar el script:

```bash
# Solo diagnóstico
npx ts-node scripts/fix-duplicate-athlete-invitations.ts vickyarmayor@hotmail.com

# Corrección (especificar el centro a mantener)
npx ts-node scripts/fix-duplicate-athlete-invitations.ts \
  vickyarmayor@hotmail.com \
  --fix \
  --keep-company="sdt"
```

**Nota:** El script requiere variables de entorno configuradas (`DB_HOST`, `DB_PORT`, etc.)
