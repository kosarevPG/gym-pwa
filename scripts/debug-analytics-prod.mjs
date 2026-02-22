/**
 * Один запуск: запрос к ПРОД Supabase (логи + упражнения), эмуляция аналитики, запись в .cursor/debug.log
 * Запуск: node scripts/debug-analytics-prod.mjs
 * Требует: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY в .env
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, appendFileSync } from 'fs';
import { resolve } from 'path';

for (const name of ['.env', '.env.local']) {
  try {
    const p = resolve(process.cwd(), name);
    if (existsSync(p)) {
      for (const line of readFileSync(p, 'utf8').split('\n')) {
        const m = line.match(/^\s*([^#=]+)=(.*)$/);
        if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
      }
    }
  } catch (_) {}
}

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Need VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(url, key);
const LOG_PATH = resolve(process.cwd(), '.cursor', 'debug.log');

function writeLog(payload) {
  appendFileSync(LOG_PATH, JSON.stringify({ ...payload, timestamp: Date.now() }) + '\n', 'utf8');
}

async function main() {
  const days = 120;
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const v2Select = 'id,completed_at,created_at,session_id,set_group_id,exercise_id,exercise_order,order_index,reps,weight,input_wt,side,rpe,rest_seconds,body_wt_snapshot,effective_load,side_mult,set_volume';

  const v2 = await supabase
    .from('training_logs')
    .select(v2Select)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(5000);

  if (v2.error) {
    writeLog({
      location: 'api.ts:fetchTrainingLogsWindow',
      message: 'v2 error fallback to legacy',
      data: { error: v2.error.message, sinceIso },
      hypothesisId: 'H1',
    });
    console.log('v2 error:', v2.error.message);
    return;
  }

  const raw = v2.data ?? [];
  const first = raw[0];
  const last = raw[raw.length - 1];
  writeLog({
    location: 'api.ts:fetchTrainingLogsWindow',
    message: 'v2 logs loaded',
    data: {
      logsCount: raw.length,
      firstTs: first?.completed_at ?? first?.created_at,
      lastTs: last?.completed_at ?? last?.created_at,
      sinceIso,
    },
    hypothesisId: 'H1,H5',
  });

  const { data: exercises } = await supabase.from('exercises').select('id,name_ru,name_en,weight_type,base_weight,category');
  const exList = exercises ?? [];
  const exMap = new Map(exList.map((e) => [e.id, e]));

  let rowsOut = 0;
  let dropped = 0;
  for (const r of raw) {
    if (exMap.has(r.exercise_id)) rowsOut++;
    else dropped++;
  }

  writeLog({
    location: 'analytics.ts:buildTrainingMetricRows',
    message: 'metric rows',
    data: { logsIn: raw.length, exercisesCount: exList.length, rowsOut, dropped },
    hypothesisId: 'H2',
  });

  const byEx = new Map();
  for (const r of raw) {
    if (!exMap.has(r.exercise_id)) continue;
    const sid = r.session_id;
    const ts = r.completed_at ?? r.created_at;
    if (!byEx.has(r.exercise_id)) byEx.set(r.exercise_id, []);
    byEx.get(r.exercise_id).push({ sessionId: sid, ts });
  }
  let exercisesWith8PlusSessions = 0;
  for (const [, rows] of byEx) {
    const sessions = new Set(rows.map((x) => x.sessionId));
    if (sessions.size >= 8) exercisesWith8PlusSessions++;
  }
  const pointsLength = exercisesWith8PlusSessions;

  writeLog({
    location: 'analytics.ts:buildExerciseProgressAndRisk',
    message: 'trend points',
    data: { exercisesInMap: byEx.size, exercisesWith8PlusSessions, pointsLength },
    hypothesisId: 'H3',
  });

  const weekStart = (d) => {
    const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = x.getUTCDay() || 7;
    x.setUTCDate(x.getUTCDate() - day + 1);
    return x.toISOString().slice(0, 10);
  };
  const attendance = new Map();
  for (const r of raw) {
    if (!exMap.has(r.exercise_id)) continue;
    const ts = r.completed_at ?? r.created_at;
    const w = weekStart(new Date(ts));
    const day = ts.slice(0, 10);
    if (!attendance.has(w)) attendance.set(w, new Set());
    attendance.get(w).add(day);
  }
  const counts = new Map();
  for (const [w, days] of attendance) counts.set(w, days.size);
  const now = new Date();
  let totalSessions12w = 0;
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    d.setUTCDate(d.getUTCDate() - (11 - i) * 7);
    const w = weekStart(d);
    totalSessions12w += counts.get(w) ?? 0;
  }

  writeLog({
    location: 'AnalyticsScreen.tsx:useEffect',
    message: 'analytics loaded',
    data: {
      logsCount: raw.length,
      metricRowsCount: rowsOut,
      totalSessions12w,
      trendRowsCount: pointsLength,
    },
    hypothesisId: 'H3,H4',
  });

  console.log('Logs:', raw.length, 'Metric rows:', rowsOut, 'Dropped:', dropped);
  console.log('Exercises with 8+ sessions:', exercisesWith8PlusSessions, 'Trend points:', pointsLength);
  console.log('Total sessions (12w):', totalSessions12w);
  console.log('Written to', LOG_PATH);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
