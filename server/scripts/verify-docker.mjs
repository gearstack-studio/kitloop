import assert from 'node:assert/strict';

const base = process.env.SMOKE_BASE_URL ?? 'http://web';
const origin = process.env.APP_ORIGIN;
const password = process.env.DEMO_BORROWER_PASSWORD;
assert.ok(origin && password, 'Set APP_ORIGIN and DEMO_BORROWER_PASSWORD');

const page = await fetch(base);
assert.equal(page.status, 200, 'Frontend must open');
assert.match(await page.text(), /<div id="root">/, 'Frontend must serve the application HTML');
const ready = await fetch(`${base}/api/ready`);
assert.equal(ready.status, 200, 'Database readiness must pass');

const login = await fetch(`${base}/api/auth/login`, {
  method: 'POST',
  headers: { Origin: origin, 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'borrower.demo', password }),
});
assert.equal(login.status, 200, 'Seeded borrower login must succeed');
const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
const csrf = login.headers.get('X-CSRF-Token');
assert.ok(cookie && csrf, 'Login must issue a session and CSRF token');
const headers = { Cookie: cookie, Origin: origin, 'X-CSRF-Token': csrf };
const identity = await fetch(`${base}/api/auth/me`, { headers });
assert.equal(identity.status, 200, 'Persisted session must authenticate');
const catalog = await fetch(`${base}/api/assets`, { headers });
assert.equal(catalog.status, 200, 'Authenticated catalog must read PostgreSQL');
const assets = await catalog.json();
assert.ok(Array.isArray(assets) && assets.length > 0, 'Seeded catalog must contain assets');
const logout = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers });
assert.equal(logout.status, 204, 'Logout must delete the session');
console.log('PASS: frontend HTML, readiness, login/session write, session read, catalog read, logout');
