# Comportamiento Actual: Vinculación de Atletas

## 📖 Resumen

El sistema **NO marca automáticamente como LEFT** las invitaciones anteriores cuando un atleta se vincula a un nuevo centro. Esto permite que un atleta tenga múltiples invitaciones APPROVED simultáneamente.

## 🔍 Cómo Funciona Actualmente

### 1. Formulario "Nuevo Atleta" (`POST /athletes/company/:companyId/create-athlete`)

**Flujo cuando el email YA existe:**

```
1. ¿Email existe? → Sí
2. ¿Ya está vinculado a ESTE centro? → Verificar
   - Si APPROVED en este centro → ❌ Error: "ya está vinculado"
   - Si PENDING en este centro → ❌ Error: "ya tiene solicitud pendiente"
   - Si LEFT/REJECTED en este centro → ✅ Reactiva la invitación
   - Si NO tiene invitación en este centro → ✅ Crea nueva invitación APPROVED
3. ¿Tiene invitaciones en OTROS centros? → ❌ NO SE VERIFICA
```

**Resultado:**
- ✅ El atleta queda vinculado al nuevo centro
- ⚠️ Sus invitaciones en otros centros NO se modifican
- ⚠️ Puede quedar con múltiples invitaciones APPROVED

### 2. Botón "Vincular Atleta" (`POST /athletes/company/:companyId/link-athlete`)

**Funciona igual que "Nuevo Atleta":**
- Solo verifica el estado en el centro actual
- NO toca invitaciones en otros centros

### 3. Código Relevante

```typescript
// src/modules/athletes/athletes.service.ts, línea ~390
// Cuando vincula un atleta existente:

const invitation = this.invitationRepository.create({
  user: existingUser,
  company: { id: companyId },  // ← Solo para ESTE centro
  status: InvitationStatus.APPROVED,
  approvedAt: new Date(),
  isOnline: isOnline ?? false,
  homeBranchId: homeBranchId ?? null,
});
savedInvitation = await this.invitationRepository.save(invitation);

// ⚠️ NO busca ni modifica invitaciones en otros centros
```

## 📊 Escenario Real: Caso Victoria

### ¿Qué pasó?

1. Victoria estaba en "Stp health and performance" (invitación APPROVED)
2. Alguien la vinculó a "sdt" usando "Nuevo Atleta" o "Vincular Atleta"
3. El sistema creó una nueva invitación APPROVED en "sdt"
4. La invitación en "Stp health and performance" NO se marcó como LEFT
5. **Resultado:** Victoria tiene 2 invitaciones APPROVED, aparece en ambos centros

### Diagrama del Estado Actual

```
Victoria (vickyarmayor@hotmail.com)
├── Invitación 1: "Stp health and performance"
│   ├── Status: APPROVED ⚠️
│   └── Debería ser: LEFT
└── Invitación 2: "sdt"
    ├── Status: APPROVED ✅
    └── Centro correcto actual
```

## 🛠️ Cómo Debería Funcionar

### Flujo Ideal

Cuando un atleta se vincula a un nuevo centro:

```
1. Buscar invitaciones APPROVED en OTROS centros
2. Marcar esas invitaciones como LEFT
3. Actualizar leftAt = fecha actual
4. Remover de company_users de esos centros
5. Crear nueva invitación APPROVED en el nuevo centro
```

### Comparación

| Aspecto | Actual ❌ | Ideal ✅ |
|---------|----------|---------|
| Verifica otros centros | No | Sí |
| Marca anteriores como LEFT | No | Sí |
| Permite múltiples APPROVED | Sí | No |
| Requiere corrección manual | Sí | No |

## 🚀 Soluciones Disponibles

### ✅ Solución Actual (PR #12)

**Herramientas administrativas para corregir manualmente:**

```bash
# 1. Diagnosticar
GET /athletes/admin/search-by-email?email=vickyarmayor@hotmail.com

# 2. Corregir
POST /athletes/admin/fix-duplicate-invitations
{
  "athleteId": "uuid",
  "keepCompanyId": "uuid-sdt"
}
```

**Pros:**
- ✅ No cambia comportamiento existente
- ✅ Permite casos especiales (atleta en múltiples centros)
- ✅ Control manual total

**Contras:**
- ⚠️ Requiere intervención manual cuando ocurre
- ⚠️ El problema puede volver a ocurrir

### 🔄 Solución Propuesta (Opción Futura)

**Auto-leave al vincular:**

Modificar el código para que automáticamente:
1. Al vincular un atleta a un centro
2. Busque invitaciones APPROVED en otros centros
3. Las marque como LEFT automáticamente

Ver detalles en: `src/modules/athletes/PROPOSAL-auto-leave-previous-centers.md`

**Pros:**
- ✅ Previene el problema automáticamente
- ✅ No requiere intervención manual
- ✅ Comportamiento más intuitivo

**Contras:**
- ⚠️ Cambia comportamiento existente
- ⚠️ Atletas NO podrían estar en múltiples centros
- ⚠️ Puede afectar casos de uso específicos

## 🤔 Pregunta Clave

**¿Un atleta debería poder estar en múltiples centros simultáneamente?**

### Caso A: NO (más común)
- Un atleta entrena en UN solo centro a la vez
- Al cambiar de centro, debe dejar el anterior
- **Solución:** Implementar auto-leave

### Caso B: SÍ (casos especiales)
- Un atleta puede entrenar en varios centros
- Ej: Club deportivo + gimnasio de rendimiento
- **Solución:** Mantener comportamiento actual + herramientas admin

### Caso C: DEPENDE
- Algunos atletas en varios centros, otros no
- Requiere validación caso por caso
- **Solución:** Validación + confirmación en frontend

## 📝 Recomendación

Para el caso de Victoria y situaciones similares:

1. **Corto plazo:** Usar las herramientas admin del PR #12
2. **Mediano plazo:** Definir regla de negocio clara
3. **Largo plazo:** Implementar auto-leave si la regla es "un centro a la vez"

## 📚 Referencias

- Código actual: `src/modules/athletes/athletes.service.ts` líneas 314-456
- PR con herramientas admin: https://github.com/ConstanzaGalia/stp-core-backend/pull/12
- Propuesta auto-leave: `src/modules/athletes/PROPOSAL-auto-leave-previous-centers.md`
- Guía de corrección: `docs/CORREGIR-INVITACIONES-DUPLICADAS.md`
