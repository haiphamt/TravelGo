import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';

const cwd = fileURLToPath(new URL('../../../backend/', import.meta.url));
const php = process.env.TRAVELGO_PHP || 'php';
const env = { ...process.env, APP_ENV: 'testing', TRAVELGO_E2E: '1', DB_CONNECTION: 'mysql', DB_DATABASE: 'travelgo_test', DB_URL: '', SESSION_DRIVER: 'database' };
const prepare = spawn(php, ['tests/Browser/prepare.php'], { cwd, env, stdio: 'inherit' });
prepare.on('error', e => { console.error(e.message); process.exitCode = 1; });
const [code] = await once(prepare, 'exit');
if (code !== 0) process.exit(code || 1);
const server = spawn(php, ['-S', '127.0.0.1:8002', '-t', 'public', 'tests/Browser/server.php'], { cwd, env, stdio: 'inherit' });
server.on('error', e => { console.error(e.message); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill());
const [exitCode] = await once(server, 'exit');
process.exitCode = exitCode || 0;
