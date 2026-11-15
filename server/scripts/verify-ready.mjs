import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { parse } from 'dotenv';

const testEnv = existsSync('.env.test') ? parse(readFileSync('.env.test')) : process.env;
if (!testEnv.DATABASE_URL || !/test/i.test(new URL(testEnv.DATABASE_URL).pathname)) {
  throw new Error('Live readiness verification requires a dedicated test database');
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function probe(databaseUrl, expected) {
  const port = await freePort();
  const child = spawn(process.execPath, ['dist/index.js'], {
    env: { ...process.env, ...testEnv, DATABASE_URL: databaseUrl, PORT: String(port), NODE_ENV: 'test' },
    stdio: 'ignore',
  });
  try {
    let started = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        const health = await fetch(`http://127.0.0.1:${port}/api/health`);
        if (health.status === 200) { started = true; break; }
      } catch { /* server is still starting */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!started) throw new Error('Built server did not start');
    const response = await fetch(`http://127.0.0.1:${port}/api/ready`);
    const body = await response.json();
    if (response.status !== expected || body.status !== (expected === 200 ? 'ready' : 'unavailable')) {
      throw new Error(`Unexpected readiness response: ${response.status} ${JSON.stringify(body)}`);
    }
    console.log(`Live /api/ready returned ${expected}`);
  } finally {
    child.kill();
  }
}

await probe(testEnv.DATABASE_URL, 200);
await probe('postgresql://invalid:invalid@127.0.0.1:1/kitloop_test', 503);
