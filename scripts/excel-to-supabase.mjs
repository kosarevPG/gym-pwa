/**
 * Перенос данных из log.xlsx в Supabase training_logs.
 * Требует: VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env или в окружении.
 *
 * Запуск: node scripts/excel-to-supabase.mjs [путь к log.xlsx]
 * По умолчанию: c:\Users\user\Desktop\log.xlsx (или ./log.xlsx)
 */

import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { randomUUID } from 'crypto';

// Загрузка .env из корня проекта
try {
  const envPath = resolve(process.cwd(), '.env');
  if (existsSync(envPath)) {
    const env = readFileSync(envPath, 'utf8');
    for (const line of env.split('\n')) {
      const m = line.match(/^\s*([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
} catch (_) {}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://iabklvkzdffwwrlugiwr.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_49iEmfAfFsckdE00zqsXJw_dKr-AuGD';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const EXCEL_PATH = process.argv[2] || resolve(process.env.USERPROFILE || process.env.HOME || '', 'Desktop', 'log.xlsx');

function normalizeName(s) {
  if (!s || typeof s !== 'string') return '';
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*\/\s*/, ' / ');
}

function parseExcelDate(val) {
  if (!val) return null;
  const s = String(val).trim();
  // "2026.02.09, 12:00" или "2026-02-09" или число (Excel serial)
  const m = s.match(/^(\d{4})[.-](\d{2})[.-](\d{2})(?:[, ]+(\d{1,2}):(\d{2}))?/);
  if (m) {
    const [, y, mo, d, h = 12, min = 0] = m;
    return new Date(Date.UTC(+y, +mo - 1, +d, +h, +min, 0)).toISOString();
  }
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = parseFloat(s);
    const date = XLSX.SSF.parse_date_code(n);
    if (date) return new Date(date.y, date.m - 1, date.d, 12, 0, 0).toISOString();
  }
  return null;
}

async function main() {
  console.log('Excel:', EXCEL_PATH);
  if (!existsSync(EXCEL_PATH)) {
    console.error('Файл не найден:', EXCEL_PATH);
    process.exit(1);
  }

  const wb = XLSX.readFile(EXCEL_PATH);
  const sh = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sh, { header: 1 });
  if (rows.length < 2) {
    console.log('В листе нет данных (только заголовок или пусто).');
    return;
  }

  const header = rows[0].map((c) => (c != null ? String(c).trim() : ''));
  const dateCol = header.findIndex((h) => /date/i.test(h));
  const exerciseIdCol = header.findIndex((h) => /exercise_id/i.test(h));
  const nameCol = header.findIndex((h) => /exercise_name|name_calc/i.test(h));
  const inputWeightCol = header.findIndex((h) => /input_weight/i.test(h));
  const totalWeightCol = header.findIndex((h) => /total_weight/i.test(h));
  const repsCol = header.findIndex((h) => /reps/i.test(h));
  const restCol = header.findIndex((h) => /rest/i.test(h));

  if (dateCol < 0 || (nameCol < 0 && exerciseIdCol < 0)) {
    console.error('В Excel нужны колонки: Date и (Exercise_Name_Calc или Exercise_ID). Текущий заголовок:', header);
    process.exit(1);
  }

  // Загружаем все упражнения для сопоставления по имени
  const { data: exercises, error: exErr } = await supabase.from('exercises').select('id, name_ru, name_en');
  if (exErr) {
    console.error('Ошибка загрузки упражнений:', exErr.message);
    process.exit(1);
  }

  const nameToId = new Map();
  for (const e of exercises || []) {
    const id = e.id;
    if (normalizeName(e.name_ru)) nameToId.set(normalizeName(e.name_ru), id);
    if (normalizeName(e.name_en)) nameToId.set(normalizeName(e.name_en), id);
    if (e.name_ru && e.name_en) nameToId.set(normalizeName(`${e.name_ru} / ${e.name_en}`), id);
    if (e.name_ru && e.name_en) nameToId.set(normalizeName(`${e.name_ru}/${e.name_en}`), id);
  }
  console.log('Загружено упражнений:', exercises?.length || 0);

  // Группируем строки по дате (день) для set_group_id; order_index — порядок внутри сессии
  const dateToGroupId = new Map();
  const groupOrderCount = new Map();
  function getSetGroupId(dateStr) {
    const d = dateStr ? String(dateStr).trim().slice(0, 10).replace(/\./g, '-') : null;
    if (!d) return randomUUID();
    if (!dateToGroupId.has(d)) dateToGroupId.set(d, randomUUID());
    return dateToGroupId.get(d);
  }
  function nextOrderIndex(setGroupId) {
    const n = (groupOrderCount.get(setGroupId) || 0) + 1;
    groupOrderCount.set(setGroupId, n);
    return n;
  }

  const toInsert = [];
  let skipped = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const dateVal = row[dateCol];
    const exerciseIdVal = exerciseIdCol >= 0 ? row[exerciseIdCol] : null;
    const nameVal = nameCol >= 0 ? row[nameCol] : null;
    const weightVal = totalWeightCol >= 0 ? row[totalWeightCol] : inputWeightCol >= 0 ? row[inputWeightCol] : null;
    const repsVal = repsCol >= 0 ? row[repsCol] : null;
    const restVal = restCol >= 0 ? row[restCol] : null;

    let exerciseId = exerciseIdVal && /^[0-9a-f-]{36}$/i.test(String(exerciseIdVal).trim()) ? String(exerciseIdVal).trim() : null;
    if (!exerciseId && nameVal) {
      const normalized = normalizeName(nameVal);
      exerciseId = nameToId.get(normalized) || null;
      if (!exerciseId && normalized.includes(' / ')) {
        exerciseId = nameToId.get(normalized.split(' / ')[0].trim().toLowerCase()) || null;
      }
    }
    if (!exerciseId) {
      skipped++;
      continue;
    }

    const weight = Number(weightVal);
    const reps = Math.floor(Number(repsVal)) || 0;
    if (reps <= 0) {
      skipped++;
      continue;
    }

    const set_group_id = getSetGroupId(dateVal);
    const order_index = nextOrderIndex(set_group_id);
    const completed_at = parseExcelDate(dateVal) || new Date().toISOString();
    const rest_seconds = restVal != null && restVal !== '' ? Math.round(Number(restVal) * 60) : null;

    toInsert.push({
      exercise_id: exerciseId,
      weight: Number.isFinite(weight) ? weight : 0,
      reps,
      set_group_id,
      order_index,
      input_wt: Number.isFinite(weight) ? weight : 0,
      side: 'BOTH',
      rest_seconds,
      completed_at,
    });
  }

  console.log('Строк к вставке:', toInsert.length, 'Пропущено (нет упражнения/повторов):', skipped);

  if (toInsert.length === 0) {
    console.log('Нечего вставлять.');
    return;
  }

  const BATCH = 100;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const chunk = toInsert.slice(i, i + BATCH);
    const { error } = await supabase.from('training_logs').insert(chunk);
    if (error) {
      console.error('Ошибка вставки (batch', Math.floor(i / BATCH) + 1, '):', error.message);
      process.exit(1);
    }
    console.log('Вставлено', Math.min(i + BATCH, toInsert.length), 'из', toInsert.length);
  }

  console.log('Готово. Всего записей в training_logs:', toInsert.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
