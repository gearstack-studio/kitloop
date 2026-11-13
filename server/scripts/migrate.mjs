import { spawn } from 'node:child_process';
import { ConfigurationError, databaseUrl } from '../dist/config.js';

try {
  databaseUrl(process.env);
  const child = spawn(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
    stdio: 'ignore',
    env: process.env,
  });
  child.on('error', () => {
    console.error('Migration could not start');
    process.exitCode = 1;
  });
  child.on('exit', (code, signal) => {
    const success = code === 0 && !signal;
    console[success ? 'log' : 'error'](success
      ? 'Migrations applied successfully'
      : 'Migration failed; check connectivity, permissions and migration history');
    process.exitCode = success ? 0 : 1;
  });
  process.on('SIGTERM', () => child.kill('SIGTERM'));
  process.on('SIGINT', () => child.kill('SIGINT'));
} catch (error) {
  console.error(error instanceof ConfigurationError ? error.message : 'Migration initialization failed');
  process.exitCode = 2;
}
