# Propuesta: Marcar automáticamente como LEFT invitaciones anteriores

## Problema Actual

Cuando un atleta se vincula a un nuevo centro (usando "Nuevo Atleta" o "Vincular Atleta"), 
el sistema NO marca como LEFT sus invitaciones APPROVED en otros centros, resultando en:
- Atletas con múltiples invitaciones APPROVED simultáneas
- Aparecen en el roster de múltiples centros
- Inconsistencias de datos

## Propuesta: Auto-Leave al Vincular

### Cambio Propuesto

Modificar `createAthleteForCompany` y `linkAthleteByEmail` para que:

1. Antes de crear la nueva invitación APPROVED
2. Busquen todas las invitaciones APPROVED del atleta en OTROS centros
3. Las marquen automáticamente como LEFT
4. Actualicen leftAt = new Date()
5. Remuevan de company_users

### Código Propuesto

```typescript
// Nuevo método privado en AthletesService
private async autoLeaveOtherCenters(
  athleteId: string,
  newCompanyId: string,
): Promise<number> {
  // Buscar todas las invitaciones APPROVED en OTROS centros
  const otherApprovedInvitations = await this.invitationRepository.find({
    where: {
      user: { id: athleteId },
      status: InvitationStatus.APPROVED,
    },
  });

  // Filtrar solo las de otros centros (no el nuevo)
  const toLeave = otherApprovedInvitations.filter(
    (inv) => inv.company?.id && inv.company.id !== newCompanyId,
  );

  // Marcar como LEFT
  for (const invitation of toLeave) {
    invitation.status = InvitationStatus.LEFT;
    invitation.leftAt = new Date();
    await this.invitationRepository.save(invitation);

    // Remover de company_users
    if (invitation.company?.id) {
      await this.removeUserFromCompany(athleteId, invitation.company.id);
    }

    this.logger.log(
      `Auto-leave: atleta ${athleteId} salió automáticamente de ${invitation.company?.name} al vincularse a nuevo centro`,
    );
  }

  return toLeave.length;
}
```

Luego llamarlo en `createAthleteForCompany` y `linkAthleteByEmail`:

```typescript
// Antes de crear la nueva invitación APPROVED:
const leftCount = await this.autoLeaveOtherCenters(existingUser.id, companyId);

// Continuar con la creación de la nueva invitación...
```

## Ventajas

✅ Previene invitaciones duplicadas automáticamente
✅ Mantiene la consistencia de datos
✅ No requiere intervención manual
✅ Comportamiento más intuitivo para los usuarios

## Desventajas

⚠️ Cambia el comportamiento existente
⚠️ Los atletas NO podrían estar en múltiples centros simultáneamente
⚠️ Podría afectar casos de uso donde un atleta legítimamente esté en 2 centros

## Alternativa: Validación + Confirmación

En lugar de auto-leave, podríamos:

1. Detectar si el atleta ya tiene invitación APPROVED en otro centro
2. Mostrar un mensaje de confirmación en el frontend:
   ```
   "Este atleta ya está en [Nombre Centro].
   ¿Deseas transferirlo a este centro?
   [Sí, transferir] [No, mantener ambos] [Cancelar]"
   ```
3. Según la respuesta:
   - "Transferir": hacer auto-leave del anterior
   - "Mantener ambos": crear sin tocar el anterior
   - "Cancelar": no hacer nada

## Pregunta para el Equipo

¿Un atleta debería poder estar en múltiples centros simultáneamente?

- **Si NO**: Implementar auto-leave (Opción 1)
- **Si SÍ**: Mantener comportamiento actual + herramientas admin de corrección
- **Depende**: Implementar validación + confirmación (Alternativa)
