/**
 * Единоразовая миграция тренировок из текстового файла (тренировки.txt) в Supabase.
 * Создаёт workout_sessions и training_logs; упражнения сопоставляются с БД по name_ru/name_en.
 *
 * Требует: VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env или в окружении.
 *
 * Запуск: node scripts/migrate-trainings-from-txt.mjs [путь к файлу]
 *   По умолчанию: c:\Users\user\Desktop\тренировки.txt
 *   --dry-run   только парсинг и маппинг, без вставки в БД
 *   --skip-existing   не создавать сессию, если в этот день уже есть завершённая сессия
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { randomUUID } from 'crypto';

// --- .env (и .env.local для локальной БД) ---
for (const name of ['.env', '.env.local']) {
  try {
    const envPath = resolve(process.cwd(), name);
    if (existsSync(envPath)) {
      const env = readFileSync(envPath, 'utf8');
      for (const line of env.split('\n')) {
        const m = line.match(/^\s*([^#=]+)=(.*)$/);
        if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
      }
    }
  } catch (_) {}
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const skipExisting = args.includes('--skip-existing');
const filePath = args.filter((a) => !a.startsWith('--'))[0] ||
  resolve(process.env.USERPROFILE || process.env.HOME || '', 'Desktop', 'тренировки.txt');

// --- Parser ---
const DATE_RE = /^\d{4}\.\d{2}\.\d{2}\s*$/;
const DURATION_RE = /^(\d+)\s*м\s*$/;
const SET_RE = /^(\d+(?:[.,]\d+)?)\s*кг\s*×\s*(\d+)\s*повторений\s*$/;
const REST_RE = /^отдых\s+(\d+(?:[.,]\d+)?)\s*м\s*$/i;

function isExerciseNameLine(line, currentDate) {
  if (!line || !currentDate) return false;
  if (line === 'СУПЕРСЕТ') return false;
  if (DATE_RE.test(line) || DURATION_RE.test(line)) return false;
  if (/^\s*•\s*$/.test(line)) return false;
  if (/•/.test(line) && line.trim().length < 60) return false; // category line like "Ноги • Плечи"
  if (/кг\s*×\s*\d+\s*повторений/.test(line)) return false;
  if (/отдых\s+\d+/i.test(line)) return false;
  if (/^\d+м\s*$/.test(line)) return false;
  return true;
}

/**
 * Парсит файл. Возвращает массив сессий.
 * Каждая сессия: { date, dateIso, durationMin, categoryNames, blocks }.
 * Каждый блок: { superset: boolean, exercises: [ { name, sets: [ { weight_kg, reps, rest_min } ] } ] }.
 */
function parseTrainingsTxt(content) {
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const sessions = [];
  let i = 0;

  while (i < lines.length) {
    const dateLine = lines[i];
    if (!DATE_RE.test(dateLine)) {
      i++;
      continue;
    }
    const date = dateLine.replace(/\s/g, '');
    const dateIso = `${date.slice(0, 4)}-${date.slice(5, 7)}-${date.slice(8, 10)}T12:00:00.000Z`;
    i++;

    let durationMin = 0;
    if (lines[i] && /^\s*•\s*$/.test(lines[i])) i++;
    const durMatch = lines[i] && DURATION_RE.exec(lines[i]);
    if (durMatch) {
      durationMin = parseInt(durMatch[1], 10);
      i++;
    }

    let categoryNames = '';
    if (lines[i] && lines[i].includes('•') && !DATE_RE.test(lines[i]) && !SET_RE.test(lines[i]))
      categoryNames = lines[i++] || '';

    const blocks = [];
    let restNext = 0;

    while (i < lines.length) {
      const line = lines[i];
      if (DATE_RE.test(line)) break;

      if (line === 'СУПЕРСЕТ') {
        i++;
        const supersetExercises = [];
        while (i < lines.length && !DATE_RE.test(lines[i]) && lines[i] !== 'СУПЕРСЕТ' && isExerciseNameLine(lines[i], date)) {
          const exName = lines[i++];
          const sets = [];
          while (i < lines.length) {
            const setLine = lines[i];
            if (DATE_RE.test(setLine)) break;
            const setM = SET_RE.exec(setLine);
            if (setM) {
              const weightKg = parseFloat(setM[1].replace(',', '.'));
              const reps = parseInt(setM[2], 10);
              sets.push({ weight_kg: weightKg, reps, rest_min: restNext });
              restNext = 0;
              i++;
              continue;
            }
            const restM = REST_RE.exec(setLine);
            if (restM) {
              restNext = parseFloat(restM[1].replace(',', '.'));
              i++;
              continue;
            }
            if (isExerciseNameLine(setLine, date)) break;
            i++;
          }
          supersetExercises.push({ name: exName, sets });
        }
        if (supersetExercises.length > 0)
          blocks.push({ superset: true, exercises: supersetExercises });
        continue;
      }

      if (isExerciseNameLine(line, date)) {
        const exName = lines[i++];
        const sets = [];
        while (i < lines.length) {
          const setLine = lines[i];
          if (DATE_RE.test(setLine)) break;
          const setM = SET_RE.exec(setLine);
          if (setM) {
            const weightKg = parseFloat(setM[1].replace(',', '.'));
            const reps = parseInt(setM[2], 10);
            sets.push({ weight_kg: weightKg, reps, rest_min: restNext });
            restNext = 0;
            i++;
            continue;
          }
          const restM = REST_RE.exec(setLine);
          if (restM) {
            restNext = parseFloat(restM[1].replace(',', '.'));
            i++;
            continue;
          }
          if (isExerciseNameLine(setLine, date) || setLine === 'СУПЕРСЕТ') break;
          i++;
        }
        blocks.push({ superset: false, exercises: [{ name: exName, sets }] });
        continue;
      }

      const restM = REST_RE.exec(line);
      if (restM) {
        restNext = parseFloat(restM[1].replace(',', '.'));
        i++;
        continue;
      }
      i++;
    }

    if (blocks.length > 0 || durationMin > 0 || categoryNames)
      sessions.push({ date, dateIso, durationMin, categoryNames, blocks });
  }

  return sessions;
}

// --- Exercise matching ---
function normalize(s) {
  if (!s || typeof s !== 'string') return '';
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

function buildExerciseMatcher(exercises) {
  const byNameRu = new Map();
  const byNameEn = new Map();
  const list = exercises || [];
  for (const e of list) {
    const id = e.id;
    const ru = normalize(e.name_ru);
    const en = normalize(e.name_en || '');
    if (ru) byNameRu.set(ru, id);
    if (en) byNameEn.set(en, id);
  }

  return function match(nameFromFile) {
    const raw = (nameFromFile || '').trim();
    const n = normalize(raw);
    const parts = n.split(/\s*\/\s*/);
    const ruPart = parts[0]?.trim() || '';
    const enPart = parts[1]?.trim() || '';

    if (byNameRu.has(n)) return byNameRu.get(n);
    if (byNameEn.has(n)) return byNameEn.get(n);
    if (ruPart && byNameRu.has(ruPart)) return byNameRu.get(ruPart);
    if (enPart && byNameEn.has(enPart)) return byNameEn.get(enPart);

    for (const e of list) {
      const ru = normalize(e.name_ru);
      const en = normalize(e.name_en || '');
      if (ru && n.includes(ru)) return e.id;
      if (en && n.includes(en)) return e.id;
      if (ru && ru.includes(n)) return e.id;
      if (en && en.includes(n)) return e.id;
    }
    return null;
  };
}

// --- Main ---
async function main() {
  console.log('Файл:', filePath);
  if (!existsSync(filePath)) {
    console.error('Файл не найден:', filePath);
    process.exit(1);
  }

  const content = readFileSync(filePath, 'utf8');
  const sessions = parseTrainingsTxt(content);
  console.log('Распарсено сессий:', sessions.length);

  if (sessions.length === 0) {
    console.log('Нет данных для миграции.');
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Нужны VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const { data: exercises, error: exErr } = await supabase
    .from('exercises')
    .select('id, name_ru, name_en');
  if (exErr) {
    console.error('Ошибка загрузки упражнений:', exErr.message);
    process.exit(1);
  }
  console.log('Загружено упражнений из БД:', (exercises || []).length);

  const matchExercise = buildExerciseMatcher(exercises);
  const unmapped = new Set();
  const unmappedList = [];

  let sessionsCreated = 0;
  let logsCreated = 0;

  for (const session of sessions) {
    const startedAt = new Date(session.dateIso).getTime();
    const endedAt = new Date(startedAt + session.durationMin * 60 * 1000).toISOString();
    const startedAtIso = new Date(startedAt).toISOString();

    if (!dryRun && skipExisting) {
      const { data: existing } = await supabase
        .from('workout_sessions')
        .select('id')
        .gte('started_at', session.dateIso.slice(0, 10) + 'T00:00:00')
        .lte('started_at', session.dateIso.slice(0, 10) + 'T23:59:59')
        .eq('status', 'completed')
        .limit(1);
      if (existing && existing.length > 0) {
        console.log('Пропуск сессии (уже есть за дату):', session.date);
        continue;
      }
    }

    let sessionId = null;
    if (!dryRun) {
      const { data: sessData, error: sessErr } = await supabase
        .from('workout_sessions')
        .insert({
          started_at: startedAtIso,
          ended_at: endedAt,
          name: session.categoryNames || null,
          status: 'completed',
        })
        .select('id')
        .single();
      if (sessErr) {
        console.error('Ошибка создания сессии', session.date, sessErr.message);
        continue;
      }
      sessionId = sessData.id;
      sessionsCreated++;
    } else {
      sessionId = randomUUID();
    }

    let logOrderOffset = 0;
    const allLogs = [];

    for (let blockIndex = 0; blockIndex < session.blocks.length; blockIndex++) {
      const block = session.blocks[blockIndex];
      const setGroupId = randomUUID();

      if (block.superset && block.exercises.length > 0) {
        const maxSets = Math.max(...block.exercises.map((e) => e.sets.length));
        for (let setNo = 0; setNo < maxSets; setNo++) {
          for (const ex of block.exercises) {
            const set = ex.sets[setNo];
            if (!set) continue;
            const exerciseId = matchExercise(ex.name);
            if (!exerciseId) {
              unmapped.add(ex.name);
              unmappedList.push({ session: session.date, exercise: ex.name });
              continue;
            }
            const completedAt = new Date(startedAt + logOrderOffset * 60 * 1000).toISOString();
            logOrderOffset++;
            allLogs.push({
              session_id: sessionId,
              set_group_id: setGroupId,
              exercise_id: exerciseId,
              order_index: setNo + 1,
              exercise_order: blockIndex,
              weight: set.weight_kg,
              reps: set.reps,
              rest_seconds: Math.round((set.rest_min || 0) * 60),
              input_wt: set.weight_kg,
              set_volume: set.weight_kg * set.reps,
              effective_load: set.weight_kg,
              completed_at: completedAt,
              side: 'BOTH',
            });
          }
        }
      } else {
        for (const ex of block.exercises) {
          const exerciseId = matchExercise(ex.name);
          if (!exerciseId) {
            unmapped.add(ex.name);
            unmappedList.push({ session: session.date, exercise: ex.name });
            continue;
          }
          ex.sets.forEach((set, setNo) => {
            const completedAt = new Date(startedAt + logOrderOffset * 60 * 1000).toISOString();
            logOrderOffset++;
            allLogs.push({
              session_id: sessionId,
              set_group_id: setGroupId,
              exercise_id: exerciseId,
              order_index: setNo + 1,
              exercise_order: blockIndex,
              weight: set.weight_kg,
              reps: set.reps,
              rest_seconds: Math.round((set.rest_min || 0) * 60),
              input_wt: set.weight_kg,
              set_volume: set.weight_kg * set.reps,
              effective_load: set.weight_kg,
              completed_at: completedAt,
              side: 'BOTH',
            });
          });
        }
      }
    }

    if (!dryRun && allLogs.length > 0) {
      const BATCH = 80;
      for (let j = 0; j < allLogs.length; j += BATCH) {
        const chunk = allLogs.slice(j, j + BATCH);
        const payload = chunk.map((r) => ({
          session_id: r.session_id,
          set_group_id: r.set_group_id,
          exercise_id: r.exercise_id,
          weight: r.weight,
          reps: r.reps,
          order_index: r.order_index,
          exercise_order: r.exercise_order,
          input_wt: r.input_wt,
          side: r.side,
          set_volume: r.set_volume,
          effective_load: r.effective_load,
          rest_seconds: r.rest_seconds,
          completed_at: r.completed_at,
        }));
        const { error: logErr } = await supabase.from('training_logs').insert(payload);
        if (logErr) {
          console.error('Ошибка вставки логов для сессии', session.date, logErr.message);
          break;
        }
        logsCreated += chunk.length;
      }
    } else if (dryRun) {
      logsCreated += allLogs.length;
    }
  }

  console.log('');
  console.log('--- Итог ---');
  if (dryRun) console.log('(режим --dry-run, в БД ничего не записано)');
  console.log('Сессий создано:', sessionsCreated);
  console.log('Логов создано:', logsCreated);
  if (unmapped.size > 0) {
    console.log('');
    console.log('Не сопоставлены с БД (названия из файла):');
    [...unmapped].sort().forEach((name) => console.log('  -', name));
    const outPath = resolve(process.cwd(), 'unmapped-exercises.txt');
    writeFileSync(
      outPath,
      [...unmapped].sort().join('\n') +
        '\n\n# По сессиям:\n' +
        unmappedList.map((u) => `${u.session} | ${u.exercise}`).join('\n'),
      'utf8'
    );
    console.log('Список также записан в', outPath);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
