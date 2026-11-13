import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const base = 'http://production:8080';
const origin = process.env.APP_ORIGIN;
const manifest = JSON.parse(process.env.BOOTSTRAP_INPUT ?? '{}');
const borrower = manifest.users.find(user => user.role === 'BORROWER');
const custodian = manifest.users.find(user => user.role === 'CUSTODIAN');
const assetId = manifest.assets[0].assetId;
const stateFile = '/state/session.json';

async function login(user) {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user.username, password: user.password }),
  });
  assert.equal(response.status, 200, 'Production login must succeed');
  const setCookie = response.headers.getSetCookie()[0];
  for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/api']) {
    assert.ok(setCookie.includes(attribute), `Session cookie must include ${attribute}`);
  }
  return { Cookie: setCookie.split(';')[0], Origin: origin, 'X-CSRF-Token': response.headers.get('X-CSRF-Token'), 'Content-Type': 'application/json' };
}

if (process.argv[2] === 'before-restart') {
  for (const path of ['/', '/requests', '/loans']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes('<div id="root">'));
    const script = html.match(/src="(\/assets\/[^\"]+\.js)"/);
    assert.ok(script, 'SPA must reference a built script');
    const asset = await fetch(base + script[1]);
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get('content-type'), /javascript/);
  }
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
  assert.equal((await fetch(`${base}/api/ready`)).status, 200);
  const headers = await login(borrower);
  assert.equal((await fetch(`${base}/api/not-a-route`, { headers })).status, 404);
  const rejected = await fetch(`${base}/api/requests`, { method: 'POST', headers: { ...headers, Origin: 'https://foreign.invalid' }, body: JSON.stringify({ assetId }) });
  assert.equal(rejected.status, 403);
  const missingCsrf = await fetch(`${base}/api/requests`, { method: 'POST', headers: { ...headers, 'X-CSRF-Token': '' }, body: JSON.stringify({ assetId }) });
  assert.equal(missingCsrf.status, 403);
  const created = await fetch(`${base}/api/requests`, { method: 'POST', headers, body: JSON.stringify({ assetId }) });
  assert.equal(created.status, 201);
  const request = await created.json();
  const forbidden = await fetch(`${base}/api/requests/${request.id}/checkout`, { method: 'POST', headers, body: JSON.stringify({ assetId, dueAt: new Date(Date.now() + 86400000).toISOString() }) });
  assert.equal(forbidden.status, 403);
  writeFileSync(stateFile, JSON.stringify({ headers, requestId: request.id }), { mode: 0o600 });
  console.log('PASS production SPA/assets, health, readiness, Secure cookie, CSRF/origin, request write, role guard');
} else if (process.argv[2] === 'after-restart') {
  const { headers, requestId } = JSON.parse(readFileSync(stateFile, 'utf8'));
  assert.equal((await fetch(`${base}/api/auth/me`, { headers })).status, 200, 'Session must survive process restart');
  const history = await (await fetch(`${base}/api/requests/mine`, { headers })).json();
  assert.ok(history.some(request => request.id === requestId), 'Borrow request must survive restart');
  const custodianHeaders = await login(custodian);
  const checkout = await fetch(`${base}/api/requests/${requestId}/checkout`, {
    method: 'POST', headers: custodianHeaders, body: JSON.stringify({ assetId, dueAt: new Date(Date.now() + 86400000).toISOString() }),
  });
  assert.equal(checkout.status, 201);
  const loans = await (await fetch(`${base}/api/loans/mine`, { headers })).json();
  assert.ok(loans.some(loan => loan.requestId === requestId && loan.status === 'ACTIVE'));
  const assets = await (await fetch(`${base}/api/assets`, { headers })).json();
  assert.equal(assets.find(asset => asset.assetId === assetId).available, false);
  assert.equal((await fetch(`${base}/api/auth/logout`, { method: 'POST', headers })).status, 204);
  assert.equal((await fetch(`${base}/api/auth/me`, { headers })).status, 401);
  console.log('PASS persisted session/request after restart, custodian checkout, active loan, availability and logout');
} else {
  throw new Error('Use before-restart or after-restart');
}
