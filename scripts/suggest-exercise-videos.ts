/**
 * Busca en YouTube videos embebibles para ejercicios que no tienen URL
 * y deja un CSV para revisar. No escribe en la base hasta --apply.
 *
 * Cada búsqueda gasta 100 unidades de la cuota diaria (tope gratis ~10.000,
 * o sea unas 80–90 búsquedas por corrida).
 *
 * Uso (desde la raíz del backend, con YOUTUBE_API_KEY en .env):
 *   npx ts-node scripts/suggest-exercise-videos.ts --limit 80
 *   npx ts-node scripts/suggest-exercise-videos.ts --limit 80 --out scripts/data/exercise-video-candidates-2.csv
 *   npx ts-node scripts/suggest-exercise-videos.ts --limit 80 --company "STP Health & Performance" --out scripts/data/exercise-video-candidates-stp.csv
 *   Completar la columna url_elegida con 1, 2 o 3, o con otra URL de YouTube. Vacío = no tocar ese ejercicio.
 *   npx ts-node scripts/suggest-exercise-videos.ts --apply --file scripts/data/exercise-video-candidates-2.csv
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import { Client } from 'pg';

const OUTPUT_PATH = path.join(__dirname, 'data', 'exercise-video-candidates.csv');
const FINISH_CSV_PATH = path.join(
  __dirname,
  'data',
  'finish-exercise-video-candidates - exercise-video-candidates.csv',
);
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

type CsvRow = Record<string, string>;

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

function readCsvRows(filePath: string): CsvRow[] {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  if (!content.trim()) return [];
  return parse(content, { columns: true, skip_empty_lines: true, relax_column_count: true, trim: true });
}

function outputPath(): string {
  const custom = argValue('--out');
  if (custom) return path.resolve(custom);
  return OUTPUT_PATH;
}

function dataCsvPaths(): string[] {
  const dir = path.join(__dirname, 'data');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith('.csv'))
    .map((name) => path.join(dir, name));
}

function alreadySearchedIds(extraPath?: string): Set<string> {
  const ids = new Set<string>();
  const paths = new Set(dataCsvPaths());
  if (extraPath) paths.add(extraPath);
  for (const filePath of paths) {
    for (const row of readCsvRows(filePath)) {
      const id = (row.id || '').trim();
      if (/^[0-9a-f-]{36}$/i.test(id)) ids.add(id);
    }
  }
  return ids;
}

function writeAllRows(filePath: string, rows: CsvRow[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [
    COLUMNS.join(','),
    ...rows.map((row) => COLUMNS.map((column) => csvEscape(row[column] || '')).join(',')),
  ];
  fs.writeFileSync(filePath, `\uFEFF${lines.join('\n')}\n`, 'utf8');
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

async function resolveCompanyId(client: Client): Promise<{ id: string; name: string } | null> {
  const raw = argValue('--company')?.trim();
  if (!raw) return null;
  if (/^[0-9a-f-]{36}$/i.test(raw)) {
    const byId = await client.query(`SELECT id, name FROM company WHERE id = $1`, [raw]);
    if (!byId.rows[0]) throw new Error(`No hay un centro con id ${raw}`);
    return byId.rows[0];
  }
  const byName = await client.query(
    `SELECT id, name FROM company WHERE name ILIKE $1 ORDER BY name LIMIT 5`,
    [raw],
  );
  if (byName.rows.length === 0) {
    throw new Error(`No hay un centro que coincida con "${raw}"`);
  }
  if (byName.rows.length > 1) {
    const names = byName.rows.map((row) => `${row.name} (${row.id})`).join(', ');
    throw new Error(`Hay más de un centro para "${raw}": ${names}`);
  }
  return byName.rows[0];
}

async function loadMissingExercises(
  client: Client,
  companyId?: string,
): Promise<ExerciseRow[]> {
  const result = await client.query(
    `
      SELECT
        e.id,
        e.name,
        mp.name AS pattern,
        e.material,
        e.es_ancla AS "isAncla"
      FROM exercise e
      LEFT JOIN movement_pattern mp ON mp.id = e."movementPatternId"
      WHERE NULLIF(btrim(COALESCE(e.video, '')), '') IS NULL
        AND ($1::uuid IS NULL OR e."companyId" = $1)
      ORDER BY e.es_ancla DESC, e.name ASC
    `,
    [companyId ?? null],
  );
  return result.rows;
}

async function suggest(apiKey: string): Promise<void> {
  const limit = Math.max(1, Number(argValue('--limit') || 80));
  const filePath = outputPath();
  const client = buildClient();
  await client.connect();
  try {
    const company = await resolveCompanyId(client);
    const missing = await loadMissingExercises(client, company?.id);
    const existing = readCsvRows(filePath);
    const seen = alreadySearchedIds(filePath);
    const pending = missing.filter((exercise) => !seen.has(exercise.id));
    const batch = pending.slice(0, limit);

    console.log(
      company
        ? `Centro: ${company.name}. Sin video: ${missing.length}. Ya buscados: ${seen.size}. Esta corrida: ${batch.length}.`
        : `Sin video: ${missing.length}. Ya buscados: ${seen.size}. Esta corrida: ${batch.length}.`,
    );
    console.log(`Archivo: ${filePath}`);
    if (batch.length === 0) {
      console.log('No hay ejercicios nuevos para buscar.');
      return;
    }

    const rows = [...existing];
    for (const [index, exercise] of batch.entries()) {
      const query = buildQuery(exercise);
      process.stdout.write(`[${index + 1}/${batch.length}] ${exercise.name} … `);
      try {
        const candidates = await searchYouTube(apiKey, query);
        rows.push(emptyRow(exercise, query, candidates));
        writeAllRows(filePath, rows);
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

    const stillPending = missing.filter((exercise) => !alreadySearchedIds(filePath).has(exercise.id)).length;
    console.log(`Listo. Archivo: ${filePath}`);
    console.log(`Completá url_elegida con 1, 2 o 3 (o una URL). Quedan ${stillPending} sin buscar.`);
  } finally {
    await client.end();
  }
}

function normalizeYoutubeUrl(raw: string): string | null {
  let value = raw.trim();
  if (!value || /^(no|skip|saltar)$/i.test(value)) return null;
  if (/^(www\.)?youtu(\.be|be\.com)/i.test(value)) {
    value = `https://${value}`;
  }
  if (!/youtu(\.be|be\.com)/i.test(value)) return null;
  return value;
}

function chosenUrl(row: CsvRow): string | null {
  const choice = (
    row['URL elegida']
    || row.url_elegida
    || row['url elegida']
    || ''
  ).trim();
  if (choice === '1' || choice === '2' || choice === '3') {
    return normalizeYoutubeUrl(row[`opcion_${choice}_url`] || '');
  }
  const named = normalizeYoutubeUrl(choice);
  if (named) return named;

  for (const [key, value] of Object.entries(row)) {
    if (key === 'id' || key === 'nombre' || key === 'patron' || key === 'material' || key === 'busqueda') continue;
    const url = normalizeYoutubeUrl(value || '');
    if (url) return url;
  }
  return null;
}

function applyCsvPath(): string {
  const custom = argValue('--file');
  if (custom) return path.resolve(custom);
  if (fs.existsSync(FINISH_CSV_PATH)) return FINISH_CSV_PATH;
  return OUTPUT_PATH;
}

async function applyChoices(): Promise<void> {
  const filePath = applyCsvPath();
  const rows = readCsvRows(filePath);
  if (rows.length === 0) {
    throw new Error(`No hay filas en ${filePath}.`);
  }

  const withId = rows.filter((row) => /^[0-9a-f-]{36}$/i.test((row.id || '').trim()));
  const chosen = withId
    .map((row) => ({ id: row.id.trim(), nombre: row.nombre, url: chosenUrl(row) }))
    .filter((row): row is { id: string; nombre: string; url: string } => Boolean(row.url));

  const skippedNoId = rows.length - withId.length;
  const skippedNoUrl = withId.filter((row) => !chosenUrl(row)).map((row) => row.nombre);
  console.log(`Archivo: ${filePath}`);
  console.log(`Para guardar: ${chosen.length}. Sin id: ${skippedNoId}. Con id y sin URL: ${skippedNoUrl.length}.`);
  for (const nombre of skippedNoUrl) {
    console.log(`  sin URL: ${nombre}`);
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
