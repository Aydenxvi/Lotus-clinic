'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createServer } = require('node:http');
const { runSmoke, parseOptions } = require('../../scripts/public-smoke');

async function fakeServer(overrides = {}) {
  const server = createServer((req, res) => {
    const url = req.url;
    const origin = req.headers.origin;
    const unauthorized = url.startsWith('/api/admin/') || url.startsWith('/api/doctor/') ||
      url.startsWith('/api/patients/') || url.startsWith('/api/appointments/') || url === '/api/auth/me';
    const fixtures = {
      '/api/health': { ok: true },
      '/api/doctors': { doctors: [{ id: 'd5', name: 'Demo Physician' }] },
      '/api/departments': { departments: [{ id: 'pediatrics', name: 'Pediatrics' }] },
      '/api/doctors/d5': { doctor: { id: 'd5', name: 'Demo Physician' } }
    };
    let status = unauthorized ? 401 : 200;
    let data = unauthorized ? { error: 'Not authenticated' } : fixtures[url];
    if (Object.hasOwn(overrides, url)) {
      status = overrides[url].status;
      data = overrides[url].data;
    }
    if (origin === 'http://localhost:7777') {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    if (url === '/' || url === '/cabinet.html' || url === '/doctor-cabinet.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!doctype html><html><title>LOTUS</title><body>Lotus Clinic</body></html>');
      return;
    }
    res.writeHead(data === undefined ? 404 : status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data === undefined ? { error: 'Not found' } : data));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { server, base };
}

async function withFixture(overrides, action) {
  const { server, base } = await fakeServer(overrides);
  try { return await action(base); }
  finally { await new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
}

test('Default live targets are the LOTUS Render sites', () => {
  const options = parseOptions([]);
  assert.equal(options.api, 'https://lotus-clinic-api.onrender.com');
  assert.equal(options.web, 'https://lotus-clinic-web.onrender.com');
});

test('Refuses an unsafe non-local HTTP API URL', () => {
  assert.throws(() => parseOptions(['--api','http://example.com']), /HTTPS/);
});

test('Normal public endpoints and denied private endpoints pass', async () => {
  await withFixture({}, async base => {
    const logs = [];
    const report = await runSmoke({ api: base, web: 'http://localhost:7777', timeoutMs: 5000 }, {
      print: message => logs.push(message),
      // This mock sends frontend pages via same backend and tests CORS with official fake origin.
      fetchImpl: (url, opts) => fetch(url.replace('http://localhost:7777',''+base), opts)
    });
    assert.equal(report.ok, true, JSON.stringify(report.results.filter(r=>!r.ok)));
    assert.ok(report.total >= 16);
    assert.ok(logs.some(l => l.includes('Read-only smoke test')));
  });
});

test('A private route leaking HTTP 200 causes an explicit failure', async () => {
  await withFixture({ '/api/admin/doctors': { status: 200, data: { doctors: [] } } }, async base => {
    const report = await runSmoke({ api: base, web: 'http://localhost:7777', timeoutMs: 5000 }, {
      print: () => {},
      fetchImpl: (url, opts) => fetch(url.replace('http://localhost:7777', base), opts)
    });
    assert.equal(report.ok, false);
    assert.ok(report.results.some(r => !r.ok && r.name.includes('Chief staff panel')));
  });
});

test('A missing public catalog is detected', async () => {
  await withFixture({ '/api/doctors': { status: 200, data: { doctors: [] } } }, async base => {
    const report = await runSmoke({ api: base, web: 'http://localhost:7777', timeoutMs: 5000 }, {
      print: () => {},
      fetchImpl: (url, opts) => fetch(url.replace('http://localhost:7777', base), opts)
    });
    assert.equal(report.ok, false);
    assert.ok(report.results.some(r => !r.ok && r.name.includes('Public doctors catalog')));
  });
});
