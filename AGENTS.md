# AGENTS.md — Sistema STP (Sistema de Entrenamiento Personalizado)

Este archivo provee contexto completo del sistema STP para que el agente pueda
implementar cualquier módulo sin necesidad de explicaciones adicionales.
Leelo completo antes de escribir cualquier código relacionado con el sistema.

---

## 1. ¿Qué es el sistema STP?

El STP es un software de gestión y planificación de entrenamientos personalizados.
Su objetivo es escalar el criterio del entrenador: no reemplazarlo, sino ordenarlo
y hacerlo consistente.

**El sistema tiene 4 pilares:**

1. **Cerebro** — Base de datos de ejercicios con atributos biomecánicos y score de complejidad
2. **Mapa** — Metodología: fases, estructura de sesiones, rangos de intensidad
3. **Perfil del atleta** — Score, nivel, historial, lesiones, feedback
4. **Motor de generación** — Algoritmo que interpreta el contexto y genera la sesión

**Actores del sistema:**
- **Entrenador** — Define la estrategia, construye la planilla, valida y publica
- **Atleta** — Ejecuta la sesión, carga el feedback (reps reales, carga, RPE, dolor)

---

## 2. Fases del sistema STP

El sistema tiene 8 fases ordenadas por progresión de complejidad:

| Fase | Código | Objetivo | Reps | Score ejercicios |
|---|---|---|---|---|
| Adaptación | `ADAPT` | Aprendizaje motor, tolerancia a la carga | 10–15 | 0 – 2.5 |
| Hipertrofia 1 | `HYP1` | Tensión mecánica base | 8–12 | 2 – 3 |
| Hipertrofia 2 | `HYP2` | Tensión mecánica alta | 6–10 | 2.5 – 3.5 |
| Hipertrofia 3 | `HYP3` | Estrés metabólico (tri series) | 10–15 | 2 – 3 |
| Fuerza 1 | `STR1` | Fuerza funcional | 4–8 | 3 – 4 |
| Fuerza 2 | `STR2` | Fuerza máxima | 3–5 | 3.5 – 5 |
| Potencia | `PWR` | Velocidad de fuerza | 1–6 | 3 – 4 |
| Resistencia a la fatiga | `END` | Tolerancia metabólica | variable | 2 – 3 |

---

## 3. Score del atleta

El score del atleta va de 1 a 5 y determina qué ejercicios puede realizar.

```
score_atleta = (experiencia × 0.4) + (control_motor × 0.4) + (capacidad_estructural × 0.2)
```

| Score | Nivel | Perfil típico |
|---|---|---|
| 1.0 – 1.9 | Inicial | Sedentarios, adultos mayores, post-rehabilitación |
| 2.0 – 2.9 | Principiante | Activos sin experiencia en fuerza |
| 3.0 – 3.9 | Intermedio | Entrenan regularmente, deportistas recreativos |
| 4.0 – 4.5 | Avanzado | Atletas entrenados, alta experiencia |
| 4.6 – 5.0 | Atleta | Competitivos, profesionales |

**Regla fundamental:** `score_ejercicio <= score_atleta`
El sistema nunca asigna un ejercicio cuyo score supere el del atleta.

---

## 4. Score del ejercicio

Calculado como suma de dimensiones binarias (0 o 1):

```
score = carga + unipodal + impacto + rotacion + multiarticular + inestabilidad
```

| Score | Nivel |
|---|---|
| 0 – 1 | Muy básico / readaptación |
| 2 – 3 | Básico |
| 4 | Intermedio |
| 5 | Intermedio–avanzado |
| 6 | Avanzado |

---

## 5. Tags de seguridad

Los tags de seguridad filtran ejercicios incompatibles con el perfil del atleta.
Se aplican SIEMPRE como primer filtro, antes que cualquier otra regla.
No existe fallback que pueda omitir este filtro.

```
candidatos = ejercicios.filter(e =>
  !e.tags_seguridad.some(t => atleta.restricciones_activas.includes(t))
)
```

### Tags disponibles

**Columna vertebral**
- `no_carga_axial` — Evita peso sobre columna (ej: hernia lumbar)
- `no_flexion_lumbar` — Evita flexión lumbar bajo carga
- `no_extension_lumbar` — Evita hiperextensión lumbar
- `no_rotacion_columna` — Evita torsión de columna

**Tren inferior**
- `no_impacto` — Evita saltos y carrera (ej: obesidad, rodilla)
- `no_flexion_profunda_rodilla` — Evita sentadillas profundas
- `no_unilaterales` — Problemas de cadera
- `no_flexion_cadera`

**Tren superior**
- `no_rango_overhead` — Evita movimientos sobre la cabeza
- `no_traccion_colgada` — Evita dominadas
- `no_apoyo_palmar` — Evita apoyo en muñecas
- `no_estres_escapula` — Evita cargas en escápula
- `no_empuje_dinamico`
- `no_flexion_supina`

**Condiciones sistémicas**
- `no_isometrico_puro` — Evita isometrías prolongadas (ej: hipertensión)
- `no_valsalva` — Evita apnea
- `no_supino` — Evita posición boca arriba
- `no_cabeza_abajo` — Evita inversiones
- `no_metabolico`

---

## 6. Patrones de movimiento

Todos los ejercicios pertenecen a uno de estos patrones:

| Código | Patrón | Ejemplos |
|---|---|---|
| `DOM_RODILLA` | Dominante de rodilla | Sentadillas, estocadas, step-ups |
| `DOM_CADERA` | Dominante de cadera | Peso muerto, hip thrust, swings |
| `EMP_HORIZ` | Empuje horizontal | Press banca, flexiones |
| `EMP_VERT` | Empuje vertical | Press militar, press Arnold |
| `TRAC_HORIZ` | Tracción horizontal | Remo con barra, TRX, polea |
| `TRAC_VERT` | Tracción vertical | Dominadas, jalón al pecho |
| `ROTACION` | Rotación | Leñadores, lanzamientos rotacionales |
| `ANTI_EXT` | Anti-extensión | Plancha, rueda abdominal |
| `ANTI_ROT` | Anti-rotación | Pallof press, plancha lateral |
| `CORE_TRAD` | Core tradicional | Crunch, tijeras |
| `LOCOMOCION` | Locomoción / metabólico | Carrera, skipping, escaladores |
| `COMPUESTO` | Compuestos | Movimientos combinados |
| `UNI_PIERNA` | Unilateral pierna | Búlgara, estocada, step-up |

---

## 7. Roles de slot (Motor Micro)

Cada posición dentro de un circuito tiene un rol que determina qué patrón de
movimiento puede ocupar ese slot.

| Rol | Código | Función | Obligatorio |
|---|---|---|---|
| Principal | `MAIN` | Mayor demanda. Siempre primero. Multiarticular. | Siempre |
| Opuesto | `OPP` | Antagonista del principal. Equilibrio muscular. | Desde HYP1 |
| Unilateral | `UNI` | Un solo miembro. Control motor y asimetría. | Desde STR1 |
| Core | `CORE` | Estabilidad de columna. | Siempre |
| Accesorio | `ACC` | Complementario, menor demanda. | Opcional |
| Metabólico | `META` | Locomoción o alta demanda metabólica. | Solo en algunas fases |

---

## 8. Ejercicios ancla

Los ejercicios ancla son fijos para el slot MAIN de su patrón. No rotan entre
períodos. El sistema los prioriza automáticamente.

| Patrón | Ancla global | Score mínimo | Alternativas (en orden) |
|---|---|---|---|
| `DOM_RODILLA` | Sentadilla con barra | 3 | Sentadilla goblet → Sentadilla en pared |
| `DOM_CADERA` | Peso muerto | 3 | Hip thrust con barra → Hip thrust con banda |
| `EMP_HORIZ` | Press plano con barra | 3 | Press con mancuernas → Flexiones |
| `EMP_VERT` | Press militar con barra | 4 | Press militar mancuernas → Press Arnold |
| `TRAC_VERT` | Dominadas | 4 | Jalón al pecho → Remo con banda |
| `TRAC_HORIZ` | Remo con barra | 3 | Remo con mancuerna → Remo TRX |
| `UNI_PIERNA` | Sentadilla búlgara | 3 | Estocada → Step-up |

El entrenador puede definir una **ancla personalizada** por atleta que tiene
prioridad sobre la ancla global.

```
ancla = getAnclaPersonalizada(atleta_id, patron) ?? getAnclaGlobal(patron)
```

---

## 9. Mapa de slots por fase y patrón de día

Esta es la tabla que el Motor Micro consulta primero para saber qué slots construir.

| Fase | Patrón día | Bloques | Slot 1 | Slot 2 | Slot 3 | Slot 4 | Slot 5 |
|---|---|---|---|---|---|---|---|
| ADAPT | Blend | 2–3 | MAIN pierna | MAIN empuje | MAIN tracción | CORE | META? |
| HYP1 | Empuje | 3 | MAIN | UNI pierna | OPP tracción | CORE | — |
| HYP1 | Tracción | 3 | MAIN | UNI pierna | OPP empuje | CORE | — |
| HYP1 | Piernas | 3 | MAIN rodilla | OPP cadera | UNI pierna | CORE | — |
| HYP2 | Empuje | 3 | MAIN | OPP tracción | UNI pierna | CORE | — |
| HYP2 | Tracción | 3 | MAIN | OPP empuje | UNI pierna | CORE | — |
| HYP2 | Piernas | 3 | MAIN rodilla | OPP cadera | UNI pierna | CORE | — |
| HYP3 | Empuje/Trac/Pier | 2–3 | MAIN | ACC comp. | META | CORE | — |
| STR1 | Empuje | 3 | MAIN pesado | ACC struct. | UNI | CORE | — |
| STR1 | Tracción | 3 | MAIN pesado | ACC struct. | UNI | CORE | — |
| STR1 | Piernas | 3 | MAIN rodilla | OPP cadera | UNI | CORE | — |
| STR2 | Empuje | 3 | MAIN lift | ACC sec. | ACC acc. | CORE | — |
| STR2 | Tracción | 3 | MAIN lift | ACC sec. | ACC acc. | CORE | — |
| STR2 | Piernas | 3 | MAIN lift | ACC sec. | UNI | CORE | — |
| PWR | Cualquiera | 2–3 | MAIN fuerza | META explos. | CORE | ACC struct. | — |
| END | Blend | 1 largo | META loc. | MAIN | OPP | UNI | CORE |

---

## 10. Motor Meso — Planilla mensual

El Motor Meso NO genera automáticamente. El entrenador construye la planilla del
mes y el sistema lo asiste con sugerencias de progresión.

### Flujo principal

```
1. Entrenador crea planilla_mes (nombre, fase, días, cantidad de semanas)
   → Sistema crea todas las semanas en estado PENDING

2. Entrenador define circuitos de cada día (EC, C1, C2, C3...)
   → Sistema valida score y tags de seguridad (advierte, no bloquea)

3. Entrenador carga prescripciones semana a semana (vueltas, reps, carga)
   → Semanas sin cargar quedan en PENDING (no se asume igual a la anterior)

4. Al cargar una semana, sistema sugiere progresión basada en semana anterior + feedback
   → Entrenador acepta, modifica o ignora cada sugerencia

5. Entrenador publica la semana → visible para el atleta
   → Sistema valida antes de publicar (reps completas, sin conflictos de seguridad)

6. Atleta ejecuta y carga feedback → alimenta sugerencia de la semana siguiente
```

### Estructura de circuitos

- **EC (calentamiento)** — tipo `WARMUP`, casi siempre movilidad, 2 vueltas
- **C1, C2, C3** — tipo `MAIN`, 2/3/4 vueltas según semana (variable)
- Las vueltas se definen en `prescripcion_semana`, no en el circuito (pueden cambiar semana a semana)
- Los ejercicios del circuito son fijos durante el mes salvo cambio explícito

### Estados de semana

```
PENDING → DRAFT → PUBLISHED → COMPLETED → ARCHIVED
```

- `PENDING` — sin prescripciones, no visible al atleta
- `DRAFT` — prescripciones cargadas, no publicada, no visible al atleta
- `PUBLISHED` — visible al atleta, ajustes menores posibles
- `COMPLETED` — todas las sesiones con feedback cargado
- `ARCHIVED` — planilla cerrada, solo lectura

---

## 11. Sistema de progresión (Motor Micro y Meso)

Árbol de decisión evaluado en cascada. La primera condición que aplica gana.

```
function sugerirProgresion(presc_anterior, feedback):

  if !feedback:
    return MANTENER  // sin datos, no asumir progresión

  if feedback.dolor >= 1:
    return { carga: carga_ant * 0.85, reps: sin_cambio, alerta: true }

  if feedback.rpe >= 9 OR !feedback.completado:
    return { carga: carga_ant * 0.90, reps: sin_cambio }

  if feedback.rpe >= 8 OR feedback.reps_real < feedback.reps_objetivo:
    return { carga: sin_cambio, reps: sin_cambio }

  if feedback.rpe >= 6:
    return { carga: carga_ant * 1.05, reps: sin_cambio }

  // RPE <= 5 — el entrenador elige entre 3 opciones
  return {
    tipo: 'ENTRENADOR_ELIGE',
    opciones: [
      { label: 'Subir carga',  carga: carga_ant * 1.075, reps: sin_cambio },
      { label: 'Subir reps',   carga: sin_cambio, reps: reps_ant + round(reps_ant * 0.10) },
      { label: 'Subir ambas',  carga: carga_ant * 1.05,  reps: reps_ant + round(reps_ant * 0.05) }
    ]
  }

// Redondeo siempre al múltiplo de 2.5 kg más cercano
function redondear(carga):
  return round(carga / 2.5) * 2.5
```

### Ejercicios sin carga externa (isométricos, peso corporal)

- Isométricos → aumentar tiempo (+5 segundos)
- Peso corporal → aumentar reps o sugerir variante más compleja
- Si score del atleta lo permite → sugerir variante unilateral

---

## 12. Reglas de selección de ejercicios (Motor Micro)

Aplicadas en este orden:

1. **Tags de seguridad** (siempre primero, sin excepciones)
   `candidatos = ejercicios.filter(e => !conflictoTags(e, atleta))`

2. **Score del ejercicio**
   `candidatos = candidatos.filter(e => e.score_total <= atleta.score)`

3. **No repetir patrón dentro del mismo bloque**
   `if patron_ya_usado_en_bloque → descartar`

4. **Leer período activo para slots no-MAIN**
   Si existe ejercicio fijado en el período → usarlo
   Si es período nuevo → seleccionar y guardar en `periodo_ejercicios`

5. **Alerta de repetición semanal**
   Si el ejercicio ya aparece en otra sesión de la misma semana → warning al entrenador

6. **Lift fijo en STR2**
   Si `slot.ejercicio_fijo != null` → usar ese, saltar selección

7. **Fallback (cascada si pool vacío)**
   1. Relajar restricción de material
   2. Permitir score hasta `score_atleta + 0.5` (solo ACC o CORE)
   3. Cambiar al siguiente patrón válido
   4. Dejar slot vacío + notificar al entrenador

---

## 13. Schema completo de base de datos

### Ejercicios y cerebro

```sql
ejercicios (
  id UUID PK,
  nombre VARCHAR,
  patron_id FK → patrones_movimiento,
  categoria_id FK,
  score_total FLOAT,          -- suma de dimensiones binarias (0–6)
  es_ancla BOOLEAN,
  score_ancla_minimo FLOAT,   -- score mínimo del atleta para usar este ancla
  unilateral BOOLEAN,
  es_isometrico BOOLEAN,
  tags_seguridad TEXT[],
  material TEXT[],
  fase_recomendada TEXT[],
  video_url VARCHAR,
  descripcion TEXT
)

anclas_globales (
  id UUID PK,
  patron_movimiento VARCHAR,
  ejercicio_id FK → ejercicios,
  alternativas_ordenadas UUID[]  -- array ordenado de ejercicio_id
)

anclas_personalizadas (
  id UUID PK,
  atleta_id FK → atletas,
  patron_movimiento VARCHAR,
  ejercicio_id FK → ejercicios
)
```

### Perfil del atleta

```sql
atletas (
  id UUID PK,
  nombre VARCHAR,
  edad INT,
  peso_corporal FLOAT,
  altura FLOAT,
  score_experiencia FLOAT,        -- 1–5
  score_control_motor FLOAT,      -- 1–5
  score_capacidad_estructural FLOAT, -- 1–5
  score_total FLOAT,              -- calculado: exp*0.4 + cm*0.4 + ce*0.2
  nivel_stp INT,                  -- 1–5
  restricciones_activas TEXT[],   -- tags de seguridad activos ahora
  entrenador_id FK
)

lesiones (
  id UUID PK,
  atleta_id FK → atletas,
  tipo VARCHAR,
  estado VARCHAR,                 -- activa / recuperacion / resuelta
  fecha_inicio DATE,
  fecha_resolucion DATE,
  tags_restriccion TEXT[]
)
```

### Motor Meso — Planilla mensual

```sql
planilla_mes (
  id UUID PK,
  atleta_id FK → atletas,
  entrenador_id FK,
  nombre VARCHAR,
  fase_id VARCHAR,                -- código de fase: ADAPT, HYP1, etc.
  fecha_inicio DATE,
  fecha_fin DATE,
  cantidad_semanas INT,
  dias_semana TEXT[],             -- ej: ['EMPUJE','TRACCION','PIERNAS']
  estado VARCHAR                  -- borrador / activa / archivada
)

dia_planilla (
  id UUID PK,
  planilla_id FK → planilla_mes,
  patron_dia VARCHAR,             -- EMPUJE / TRACCION / PIERNAS / BLEND
  orden_en_semana INT,            -- 1–7
  nombre_dia VARCHAR              -- ej: 'Lunes'
)

circuito (
  id UUID PK,
  dia_planilla_id FK → dia_planilla,
  numero_circuito INT,            -- 0=EC, 1=C1, 2=C2, 3=C3...
  nombre VARCHAR,                 -- 'EC', 'C1', 'C2', 'C3'
  tipo VARCHAR                    -- WARMUP / MAIN / FINISH
)

ejercicio_circuito (
  id UUID PK,
  circuito_id FK → circuito,
  orden INT,
  ejercicio_id FK → ejercicios,
  variante_descripcion VARCHAR,   -- texto libre: 'con barra', '1 pierna', etc.
  es_ancla BOOLEAN
)

semana_planilla (
  id UUID PK,
  planilla_id FK → planilla_mes,
  numero_semana INT,
  fecha_inicio DATE,
  fecha_fin DATE,
  estado VARCHAR                  -- PENDING / DRAFT / PUBLISHED / COMPLETED / ARCHIVED
)

prescripcion_semana (
  id UUID PK,
  semana_planilla_id FK → semana_planilla,
  ejercicio_circuito_id FK → ejercicio_circuito,
  vueltas_circuito INT,           -- 2, 3 o 4 vueltas (puede cambiar cada semana)
  reps_objetivo VARCHAR,          -- texto: '8×8', '10', '30"', '6 a 8'
  carga_objetivo FLOAT,           -- en kg, null si es peso corporal
  notas TEXT,
  sugerencia_sistema JSONB,       -- sugerencia generada automáticamente
  sugerencia_aceptada BOOLEAN
)

feedback_ejercicio (
  id UUID PK,
  prescripcion_semana_id FK → prescripcion_semana,
  reps_real VARCHAR,
  carga_real FLOAT,
  completado BOOLEAN,
  rpe INT,                        -- 1–10
  dolor INT,                      -- 0=sin dolor, 1=molestia, 2=dolor, 3=dolor fuerte
  nota TEXT,
  cargado_por VARCHAR,            -- 'atleta' / 'entrenador'
  fecha TIMESTAMP
)

cambio_ejercicio (
  id UUID PK,
  ejercicio_circuito_id FK → ejercicio_circuito,
  semana_desde INT,
  ejercicio_nuevo_id FK → ejercicios,
  variante_nueva VARCHAR,
  motivo TEXT,
  ejercicio_anterior_id FK → ejercicios
)
```

### Motor Micro — Generación de sesión (modo automático)

```sql
fase_config (
  id UUID PK,
  fase_codigo VARCHAR,
  bloques_min INT,
  bloques_max INT,
  ejercicios_por_bloque INT,
  reps_min INT,
  reps_max INT,
  score_min FLOAT,
  score_max FLOAT,
  densidad VARCHAR
)

slot_template (
  id UUID PK,
  fase_codigo VARCHAR,
  patron_dia VARCHAR,
  bloque_num INT,
  slot_num INT,
  rol VARCHAR,                    -- MAIN / OPP / UNI / CORE / ACC / META
  patrones_validos TEXT[],        -- patrones de movimiento válidos para este slot
  obligatorio BOOLEAN
)

periodos (
  id UUID PK,
  atleta_id FK → atletas,
  fase_codigo VARCHAR,
  fecha_inicio DATE,
  fecha_fin DATE,
  duracion_semanas INT,
  activo BOOLEAN
)

periodo_ejercicios (
  id UUID PK,
  periodo_id FK → periodos,
  patron_dia VARCHAR,
  bloque_num INT,
  slot_num INT,
  rol VARCHAR,
  ejercicio_id FK → ejercicios,
  fijado_por_entrenador BOOLEAN
)

config_progresion (
  id UUID PK,
  atleta_id FK → atletas,
  pct_aumento_carga FLOAT,        -- default 0.05 (5%)
  pct_aumento_reps FLOAT,         -- default 0.10 (10%)
  redondeo_kg FLOAT               -- default 2.5
)

sesiones_generadas (
  id UUID PK,
  atleta_id FK → atletas,
  periodo_id FK → periodos,
  fecha DATE,
  fase_codigo VARCHAR,
  patron_dia VARCHAR,
  estado VARCHAR                  -- borrador / confirmada / completada
)

bloques_sesion (
  id UUID PK,
  sesion_id FK → sesiones_generadas,
  bloque_num INT,
  tipo_bloque VARCHAR
)

ejercicios_en_sesion (
  id UUID PK,
  bloque_id FK → bloques_sesion,
  slot_num INT,
  rol VARCHAR,
  ejercicio_id FK → ejercicios,
  series INT,
  reps_objetivo VARCHAR,
  carga_objetivo FLOAT,
  rpe_objetivo INT,
  alerta_progresion JSONB         -- null o { tipo, opciones[] }
)
```

---

## 14. Pseudocódigo de funciones principales

### Motor Micro — generarSesion

```
function generarSesion(atleta_id, fecha, patron_dia):
  atleta        = getAtleta(atleta_id)
  periodo       = getPeriodoActivo(atleta_id)
  fase          = getFase(periodo.fase_codigo)
  fase_config   = getFaseConfig(fase.codigo)
  restricciones = atleta.restricciones_activas

  slots   = getSlotTemplate(fase.codigo, patron_dia)
  sesion  = crearSesion(atleta_id, periodo.id, fecha, patron_dia)

  for slot in slots:
    ejercicio = null

    if slot.rol == 'MAIN':
      ejercicio = resolverAncla(atleta_id, slot.patrones_validos[0], restricciones, atleta.score)
    else:
      ejercicio = getPeriodoEjercicio(periodo.id, patron_dia, slot)
      if ejercicio == null:
        ejercicio = seleccionarEjercicio(atleta, slot, restricciones, sesion)
        guardarEnPeriodo(periodo.id, patron_dia, slot, ejercicio)

    if ejercicio == null:
      ejercicio = fallback(atleta, slot, restricciones)

    if ejercicio != null:
      historial    = getHistorial(atleta_id, ejercicio.id)
      prescripcion = calcularProgresion(historial, fase_config, atleta.config_progresion)
      agregarEjercicioASesion(sesion, slot, ejercicio, prescripcion)

  return sesion  // estado: borrador


function resolverAncla(atleta_id, patron, restricciones, score_atleta):
  ancla = getAnclaPersonalizada(atleta_id, patron) ?? getAnclaGlobal(patron)

  if ancla.score_minimo <= score_atleta AND !conflictoTags(ancla, restricciones):
    return ancla.ejercicio

  for alt_id in ancla.alternativas_ordenadas:
    alt = getEjercicio(alt_id)
    if alt.score_total <= score_atleta AND !conflictoTags(alt, restricciones):
      return alt

  return null
```

### Motor Meso — sugerirProgresion

```
function sugerirProgresion(semana_anterior_id, ejercicio_circuito_id):
  presc = getPrescripcion(semana_anterior_id, ejercicio_circuito_id)
  fb    = getFeedback(presc.id)

  if !fb:
    return { tipo: 'SIN_DATOS', reps: presc.reps_objetivo, carga: presc.carga_objetivo }

  if fb.dolor >= 1:
    return { tipo: 'ALERTA', carga: redondear(presc.carga_objetivo * 0.85),
             reps: presc.reps_objetivo, requiere_revision: true }

  if fb.rpe >= 9 OR !fb.completado:
    return { tipo: 'REDUCIR', carga: redondear(presc.carga_objetivo * 0.90),
             reps: presc.reps_objetivo }

  if fb.rpe >= 8 OR fb.reps_real < presc.reps_objetivo:
    return { tipo: 'MANTENER', carga: presc.carga_objetivo, reps: presc.reps_objetivo }

  if fb.rpe >= 6:
    return { tipo: 'SUBIR_CARGA', carga: redondear(presc.carga_objetivo * 1.05),
             reps: presc.reps_objetivo }

  return {
    tipo: 'ENTRENADOR_ELIGE',
    opciones: [
      { label: 'Subir carga',  carga: redondear(presc.carga_objetivo * 1.075), reps: presc.reps_objetivo },
      { label: 'Subir reps',   carga: presc.carga_objetivo, reps: presc.reps_objetivo + round(presc.reps_objetivo * 0.10) },
      { label: 'Subir ambas',  carga: redondear(presc.carga_objetivo * 1.05),  reps: presc.reps_objetivo + round(presc.reps_objetivo * 0.05) }
    ]
  }


function publicarSemana(semana_id):
  semana = getSemana(semana_id)
  atleta = getAtleta(semana.planilla.atleta_id)
  prescs = getPrescripciones(semana_id)

  for p in prescs:
    if !p.reps_objetivo:
      throw Error('Falta prescripción: ' + p.ejercicio.nombre)
    if conflictoTags(p.ejercicio, atleta.restricciones_activas):
      throw Error('Ejercicio incompatible con lesión activa: ' + p.ejercicio.nombre)

  semana.estado = 'PUBLISHED'
  notificarAtleta(atleta.id, semana_id)
  return semana


function redondear(carga):
  return Math.round(carga / 2.5) * 2.5
```

---

## 15. Convenciones de implementación

- **Redondeo de carga** — siempre a múltiplo de 2.5 kg: `round(carga / 2.5) * 2.5`
- **reps_objetivo** — se guarda como `VARCHAR` porque puede ser '8×8', '30"', '6 a 8', 'x10'
- **carga_objetivo** — `FLOAT` en kg, `null` si es ejercicio de peso corporal o isométrico
- **Tags de seguridad** — arrays de strings. Validar con intersección de sets, nunca con loops anidados
- **Estados** — usar enums o constantes, nunca strings mágicos en el código
- **Sesiones en borrador** — toda sesión generada arranca en `borrador`. El entrenador la revisa y confirma antes de que el atleta la vea
- **Semanas en blanco** — estado `PENDING` es válido. Nunca asumir que una semana sin prescripción es igual a la anterior
- **Feedback** — si no hay feedback, no hay progresión. El sistema nunca asume progresión sin confirmación
- **Anclas** — la ancla personalizada siempre tiene prioridad sobre la global
- **Conflictos de seguridad** — advertir pero no bloquear al definir circuitos. Bloquear al publicar la semana

---

## 16. Lo que el sistema NUNCA hace

- Cambiar de fase automáticamente
- Ignorar lesiones activas bajo ningún criterio
- Subir complejidad de ejercicios sin control del entrenador
- Asumir progresión si no hay feedback del atleta
- Publicar una semana con ejercicios que conflictúen con lesiones activas
- Reemplazar el criterio técnico del entrenador
