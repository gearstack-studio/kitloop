import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const destination = process.argv[2];
if (!destination) throw new Error('Provide a temporary configuration path outside the repository');
const password = () => randomBytes(24).toString('hex');
const databasePassword = password();
const manifest = {
  users: [
    { username: 'runtime.borrower', password: password(), role: 'BORROWER' },
    { username: 'runtime.custodian', password: password(), role: 'CUSTODIAN' },
  ],
  assets: [{ assetId: 'RUNTIME-CAM-001', name: 'Runtime test camera', category: 'Camera', description: 'Isolated runtime fixture', custodianUsername: 'runtime.custodian' }],
};
if (process.env.GITHUB_ACTIONS === 'true') {
  for (const value of [databasePassword, ...manifest.users.map(user => user.password), JSON.stringify(manifest)]) {
    console.log(`::add-mask::${value}`);
  }
}
const csrfSecret = randomBytes(32).toString('hex');
const databaseUrl = `postgresql://kitloop_runtime:${databasePassword}@db:5432/kitloop_runtime_test`;
if (process.env.GITHUB_ACTIONS === 'true') {
  console.log(`::add-mask::${csrfSecret}`);
  console.log(`::add-mask::${databaseUrl}`);
}
writeFileSync(destination, [
  'POSTGRES_USER=kitloop_runtime',
  `POSTGRES_PASSWORD=${databasePassword}`,
  'POSTGRES_DB=kitloop_runtime_test',
  `DATABASE_URL=${databaseUrl}`,
  'APP_ORIGIN=https://runtime.kitloop.test',
  `SESSION_CSRF_SECRET=${csrfSecret}`,
  `BOOTSTRAP_INPUT='${JSON.stringify(manifest)}'`,
  'RUNTIME_TEST_PORT=8083',
].join('\n') + '\n', { flag: 'wx', mode: 0o600 });
console.log('Created isolated production test configuration');
