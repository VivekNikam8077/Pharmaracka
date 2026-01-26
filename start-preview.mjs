import { spawn } from 'node:child_process';

const port = Number.parseInt(process.env.PORT || '4173', 10) || 4173;

const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vite', 'preview', '--host', '0.0.0.0', '--port', String(port), '--strictPort'],
  { stdio: 'inherit' }
);

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
