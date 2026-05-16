#!/usr/bin/env node
const TMA = process.env.QA_SMOKE_TMA ?? 'http://127.0.0.1:3100';
const BACKEND = process.env.QA_SMOKE_BACKEND ?? 'http://127.0.0.1:3101';
const routes = [
  { url: `${BACKEND}/health`, expect: 200 },
  { url: `${BACKEND}/me`, expect: 401 }, // initData missing → expected 401
  { url: `${TMA}/`, expect: 200 },
];
let fail = 0;
for (const r of routes) {
  try {
    const res = await fetch(r.url);
    const ok = res.status === r.expect;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${res.status} ${r.url}`);
    if (!ok) fail++;
  } catch (e) {
    console.log(`FAIL ERR ${r.url} ${e.message}`);
    fail++;
  }
}
process.exit(fail === 0 ? 0 : 1);
