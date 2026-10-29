// LOTUS CLINIC public read-only release smoke test.
// No credentials, cookies, POST, PATCH, PUT, DELETE or patient records.
// Node.js >= 18. Run from anywhere: node backend/scripts/public-smoke.js
'use strict';

const DEFAULT_API = 'https://lotus-clinic-api.onrender.com';
const DEFAULT_WEB = 'https://lotus-clinic-web.onrender.com';

function parseOptions(args) {
  const opts = { api: DEFAULT_API, web: DEFAULT_WEB, timeoutMs: 90000 };
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (!['--api', '--web', '--timeout-ms'].includes(key)) {
      throw new Error(`Unknown option ${key}. Use --api URL --web URL --timeout-ms N`);
    }
    if (i + 1 >= args.length) throw new Error(`Missing value for ${key}`);
    const value = args[++i];
    if (key === '--timeout-ms') {
      opts.timeoutMs = Number(value);
      if (!Number.isInteger(opts.timeoutMs) || opts.timeoutMs < 5000 || opts.timeoutMs > 180000) {
        throw new Error('--timeout-ms must be 5000..180000');
      }
    } else {
      opts[key.slice(2)] = value;
    }
  }
  for (const key of ['api', 'web']) {
    const url = new URL(opts[key]);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      throw new Error(`--${key} must be a simple HTTP(S) origin without credentials/path/query`);
    }
    if (url.protocol !== 'https:' && !['localhost','127.0.0.1','[::1]'].includes(url.hostname)) {
      throw new Error(`--${key} must use HTTPS except for localhost`);
    }
    opts[key] = url.origin;
  }
  return opts;
}

async function get(url, { timeoutMs, headers = {}, fetchImpl = fetch } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || 90000);
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'error',
      credentials: 'omit',
      headers: { 'Accept': 'application/json, text/html', 'Cache-Control': 'no-store', ...headers },
      signal: controller.signal
    });
    const contentType = response.headers.get('content-type') || '';
    const body = await response.text();
    let data = null;
    if (contentType.includes('json')) {
      try { data = JSON.parse(body); } catch { /* report as invalid JSON below */ }
    }
    return { status: response.status, headers: response.headers, contentType, body, data };
  } finally {
    clearTimeout(timer);
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function runSmoke(opts, { fetchImpl = fetch, print = console.log } = {}) {
  const options = { ...parseOptions([]), ...opts };
  const fetchPath = (base, route, headers) => get(base + route, {
    timeoutMs: options.timeoutMs, fetchImpl, headers
  });
  const results = [];
  async function check(name, fn) {
    try {
      await fn();
      results.push({ name, ok: true });
      print(`PASS  ${name}`);
    } catch (e) {
      results.push({ name, ok: false, error: e.message });
      print(`FAIL  ${name}: ${e.message}`);
    }
  }
  // No mutation: every request below is GET, without any credentials or cookies.
  await check('Backend health', async () => {
    const r = await fetchPath(options.api, '/api/health');
    expect(r.status === 200 && r.data?.ok === true, `Expected HTTP 200 and ok=true; received ${r.status}`);
  });
  let firstDoctor = null;
  await check('Public doctors catalog', async () => {
    const r = await fetchPath(options.api, '/api/doctors');
    expect(r.status === 200 && Array.isArray(r.data?.doctors) && r.data.doctors.length > 0,
      `Missing public doctors array, HTTP ${r.status}`);
    firstDoctor = r.data.doctors.find(d => d.id === 'd5') || r.data.doctors[0];
    expect(typeof firstDoctor.id === 'string' && !!firstDoctor.name, 'Doctor record is missing id/name');
  });
  await check('Public departments catalog', async () => {
    const r = await fetchPath(options.api, '/api/departments');
    expect(r.status === 200 && Array.isArray(r.data?.departments) && r.data.departments.length > 0,
      `Missing public departments array, HTTP ${r.status}`);
  });
  await check('Doctor profile by ID', async () => {
    expect(firstDoctor, 'Doctor catalog check failed');
    const r = await fetchPath(options.api, `/api/doctors/${encodeURIComponent(firstDoctor.id)}`);
    expect(r.status === 200 && r.data?.doctor?.id === firstDoctor.id, `Doctor profile returned HTTP ${r.status}`);
  });
  for (const [name, path] of [
    ['Patient appointments are private', '/api/appointments/me'],
    ['Patient profile is private', '/api/patients/me'],
    ['Patient medical record is private', '/api/patients/me/medical-record'],
    ['Patient consultations are private', '/api/patients/me/consultations'],
    ['Doctor schedule is private', '/api/doctor/schedule'],
    ['Chief staff panel is private', '/api/admin/doctors'],
    ['Chief pharmacy is private', '/api/admin/pharmacy'],
    ['Chief treatment reports are private', '/api/admin/treatment'],
    ['Anonymous session has no identity', '/api/auth/me']
  ]) {
    await check(name, async () => {
      const r = await fetchPath(options.api, path);
      expect(r.status === 401, `Expected 401 without session; received ${r.status}`);
    });
  }
  await check('Production CORS allows official frontend', async () => {
    const r = await fetchPath(options.api, '/api/health', { Origin: options.web });
    const allowed = r.headers.get('access-control-allow-origin');
    expect(r.status === 200 && allowed === options.web,
      `Expected CORS origin ${options.web}, got ${allowed || '(none)'} / HTTP ${r.status}`);
    expect(r.headers.get('access-control-allow-credentials') === 'true', 'CORS credentials not enabled');
  });
  await check('Production CORS does not permit unknown origin', async () => {
    const evil = 'https://untrusted-lotus-smoke.invalid';
    const r = await fetchPath(options.api, '/api/health', { Origin: evil });
    expect(r.headers.get('access-control-allow-origin') !== evil,
      'Unknown origin has been explicitly allowed');
  });
  for (const [name, route] of [
    ['Public homepage', '/'],
    ['Patient login page', '/cabinet.html'],
    ['Doctor login/dashboard page', '/doctor-cabinet.html']
  ]) {
    await check(name, async () => {
      const r = await fetchPath(options.web, route);
      expect(r.status === 200 && /<html\b/i.test(r.body) && /lotus/i.test(r.body),
        `Expected LOTUS HTML, received HTTP ${r.status}`);
    });
  }
  const passed = results.filter(r => r.ok).length;
  print(`\nResult: ${passed}/${results.length} checks passed.`);
  print('Read-only smoke test: no patient accounts or appointments were created.');
  return { passed, total: results.length, ok: passed === results.length, results };
}

module.exports = { runSmoke, get, parseOptions };

if (require.main === module) {
  (async () => {
    const options = parseOptions(process.argv.slice(2));
    console.log(`LOTUS CLINIC — production read-only smoke test\nAPI: ${options.api}\nWEB: ${options.web}\n`);
    const report = await runSmoke(options);
    if (!report.ok) process.exitCode = 1;
  })().catch(e => {
    console.error(`Smoke test could not start: ${e.message}`);
    process.exitCode = 1;
  });
}
