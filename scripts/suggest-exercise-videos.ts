/**
 * Busca en YouTube videos embebibles para ejercicios que no tienen URL
 * y deja un CSV para revisar. No escribe en la base hasta --apply.
 *
 * Cada búsqueda gasta 100 unidades de la cuota diaria (tope gratis ~10.000,
 * o sea unas 80–90 búsquedas por corrida).
 *
 * Uso (desde la raíz del backend, con YOUTUBE_API_KEY en .env):
 *   npx ts-node scripts/suggest-exercise-videos.ts --limit 80
 *   Completar la columna url_elegida en scripts/data/exercise-video-candidates.csv
 *     con 1, 2 o 3, o con otra URL de YouTube. Vacío = no tocar ese ejercicio.
 *   npx ts-node scripts/suggest-exercise-videos.ts --apply
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import { Client } from 'pg';

const OUTPUT_PATH = path.join(__dirname, 'data', 'exercise-video-candidates.csv');
const COLUMNS = [
  'id',
  'nombre',
  'patron',
  'material',
  'busqueda',
  'opcion_1_titulo',
  'opcion_1_canal',
  'opcion_1_url',
  'opcion_2_titulo',
  'opcion_2_canal',
  'opcion_2_url',
  'opcion_3_titulo',
  'opcion_3_canal',
  'opcion_3_url',
  'url_elegida',
] as const;

type CsvRow = Record<(typeof COLUMNS)[number], string>;

interface ExerciseRow {
  id: string;
  name: string;
  pattern: string | null;
  material: string | null;
  isAncla: boolean;
}

interface Candidate {
  title: string;
  channel: string;
  url: string;
}

function buildClient(): Client {
  const sslEnabled = String(process.env.DB_SSL ?? 'true').toLowerCase() !== 'false';
  return new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: sslEnabled ? { rejectUnauthorized: false } : false,
  });
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function cleanName(name: string): string {
  return name
    .replace(/\bmc\b/gi, 'mancuernas')
    .replace(/\s+/g, ' ')
    .trim();
}

function materialHint(name: string, material: string | null): string {
  const raw = (material || '').toLowerCase();
  const nameLower = name.toLowerCase();
  const hints: Array<[RegExp, string]> = [
    [/mancuerna/, 'mancuernas'],
    [/banda/, 'banda'],
    [/barra/, 'barra'],
    [/kettlebell|pesa rusa/, 'pesa rusa'],
    [/trx/, 'TRX'],
    [/polea/, 'polea'],
    [/medicine|bal[oó]n/, 'pelota medicinal'],
    [/m[aá]quina/, 'máquina'],
  ];
  for (const [pattern, hint] of hints) {
    if (pattern.test(raw) && !nameLower.includes(hint.toLowerCase())) return hint;
  }
  return '';
}

function buildQuery(exercise: ExerciseRow): string {
  const name = cleanName(exercise.name);
  const hint = materialHint(name, exercise.material);
  return [name, hint, 'ejercicio'].filter(Boolean).join(' ').slice(0, 140);
}

function readExistingRows(): CsvRow[] {
  if (!fs.existsSync(OUTPUT_PATH)) return [];
  const content = fs.readFileSync(OUTPUT_PATH, 'utf8').replace(/^\uFEFF/, '');
  if (!content.trim()) return [];
  return parse(content, { columns: true, skip_empty_lines: true, relax_column_count: true });
}

function writeAllRows(rows: CsvRow[]): void {
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  const lines = [
    COLUMNS.join(','),
    ...rows.map((row) => COLUMNS.map((column) => csvEscape(row[column] || '')).join(',')),
  ];
  fs.writeFileSync(OUTPUT_PATH, `\uFEFF${lines.join('\n')}\n`, 'utf8');
}

function emptyRow(exercise: ExerciseRow, query: string, candidates: Candidate[]): CsvRow {
  const row = {
    id: exercise.id,
    nombre: exercise.name,
    patron: exercise.pattern || '',
    material: exercise.material || '',
    busqueda: query,
    opcion_1_titulo: '',
    opcion_1_canal: '',
    opcion_1_url: '',
    opcion_2_titulo: '',
    opcion_2_canal: '',
    opcion_2_url: '',
    opcion_3_titulo: '',
    opcion_3_canal: '',
    opcion_3_url: '',
    url_elegida: '',
  } as CsvRow;
  candidates.slice(0, 3).forEach((candidate, index) => {
    const slot = index + 1;
    row[`opcion_${slot}_titulo` as keyof CsvRow] = candidate.title;
    row[`opcion_${slot}_canal` as keyof CsvRow] = candidate.channel;
    row[`opcion_${slot}_url` as keyof CsvRow] = candidate.url;
  });
  return row;
}

async function searchYouTube(apiKey: string, query: string): Promise<Candidate[]> {
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'video');
  url.searchParams.set('videoEmbeddable', 'true');
  url.searchParams.set('relevanceLanguage', 'es');
  url.searchParams.set('regionCode', 'AR');
  url.searchParams.set('maxResults', '3');
  url.searchParams.set('q', query);
  url.searchParams.set('key', apiKey);

  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) {
    const reason = body?.error?.errors?.[0]?.reason || body?.error?.message || response.statusText;
    const error = new Error(String(reason)) as Error & { status?: number; reason?: string };
    error.status = response.status;
    error.reason = String(reason);
    throw error;
  }

  const items = Array.isArray(body.items) ? body.items : [];
  return items
    .map((item) => {
      const videoId = item?.id?.videoId;
      if (!videoId) return null;
      return {
        title: decodeHtml(String(item?.snippet?.title || '')),
        channel: String(item?.snippet?.channelTitle || ''),
        url: `https://www.youtube.com/watch?v=${videoId}`,
      };
    })
    .filter((candidate): candidate is Candidate => Boolean(candidate));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadMissingExercises(client: Client): Promise<ExerciseRow[]> {
  const result = await client.query(`
    SELECT
      e.id,
      e.name,
      mp.name AS pattern,
      e.material,
      e.es_ancla AS "isAncla"
    FROM exercise e
    LEFT JOIN movement_pattern mp ON mp.id = e."movementPatternId"
    WHERE NULLIF(btrim(COALESCE(e.video, '')), '') IS NULL
    ORDER BY e.es_ancla DESC, e.name ASC
  `);
  return result.rows;
}

async function suggest(apiKey: string): Promise<void> {
  const limit = Math.max(1, Number(argValue('--limit') || 80));
  const client = buildClient();
  await client.connect();
  try {
    const missing = await loadMissingExercises(client);
    const existing = readExistingRows();
    const seen = new Set(existing.map((row) => row.id));
    const pending = missing.filter((exercise) => !seen.has(exercise.id));
    const batch = pending.slice(0, limit);

    console.log(`Sin video: ${missing.length}. Ya buscados: ${seen.size}. Esta corrida: ${batch.length}.`);
    if (batch.length === 0) {
      console.log(`No hay ejercicios nuevos para buscar. Revisá ${OUTPUT_PATH}`);
      return;
    }

    const rows = [...existing];
    for (const [index, exercise] of batch.entries()) {
      const query = buildQuery(exercise);
      process.stdout.write(`[${index + 1}/${batch.length}] ${exercise.name} … `);
      try {
        const candidates = await searchYouTube(apiKey, query);
        rows.push(emptyRow(exercise, query, candidates));
        writeAllRows(rows);
        console.log(candidates.length ? `${candidates.length} opciones` : 'sin resultados');
      } catch (error) {
        const reason = (error as { reason?: string }).reason || (error as Error).message;
        console.log(`error: ${reason}`);
        if (/quota|dailyLimit|rateLimit|forbidden/i.test(reason) || (error as { status?: number }).status === 403) {
          console.log('Se cortó por la cuota de YouTube. Lo ya guardado queda en el CSV. Mañana se puede seguir: los buscados no se repiten.');
          break;
        }
        if (/keyInvalid|API key/i.test(reason)) {
          throw error;
        }
      }
      await sleep(200);
    }

    const stillPending = missing.length - new Set(rows.map((row) => row.id)).size;
    console.log(`Listo. Archivo: ${OUTPUT_PATH}`);
    console.log(`Completá url_elegida con 1, 2 o 3 (o una URL). Quedan ${stillPending} sin buscar.`);
  } finally {
    await client.end();
  }
}

function chosenUrl(row: CsvRow): string | null {
  const choice = (row.url_elegida || '').trim();
  if (!choice || /^(no|skip|saltar)$/i.test(choice)) return null;
  if (choice === '1' || choice === '2' || choice === '3') {
    return row[`opcion_${choice}_url` as keyof CsvRow]?.trim() || null;
  }
  if (/youtu(\.be|be\.com)/i.test(choice)) return choice;
  return null;
}

async function applyChoices(): Promise<void> {
  const rows = readExistingRows();
  if (rows.length === 0) {
    throw new Error(`No hay filas en ${OUTPUT_PATH}. Primero corré la búsqueda.`);
  }

  const chosen = rows
    .map((row) => ({ id: row.id, nombre: row.nombre, url: chosenUrl(row), raw: (row.url_elegida || '').trim() }))
    .filter((row) => row.url);

  const invalid = rows.filter((row) => (row.url_elegida || '').trim() && !chosenUrl(row));
  console.log(`Para guardar: ${chosen.length}. Con url_elegida inválida: ${invalid.length}.`);
  for (const row of invalid) {
    console.log(`  ignorada (${row.nombre}): "${row.url_elegida}"`);
  }
  if (chosen.length === 0) return;

  const client = buildClient();
  await client.connect();
  try {
    let updated = 0;
    for (const row of chosen) {
      const result = await client.query(
        `
          UPDATE exercise
          SET video = $2
          WHERE id = $1
            AND NULLIF(btrim(COALESCE(video, '')), '') IS NULL
        `,
        [row.id, row.url],
      );
      if (result.rowCount) {
        updated += result.rowCount;
        console.log(`  ${row.nombre} → ${row.url}`);
      }
    }
    console.log(`Actualizados: ${updated}. Los que ya tenían video no se pisaron.`);
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  if (hasFlag('--apply')) {
    await applyChoices();
    return;
  }

  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('Falta YOUTUBE_API_KEY en stp-core-backend/.env');
  }
  await suggest(apiKey);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
