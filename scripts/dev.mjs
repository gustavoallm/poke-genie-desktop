// Starts the API and the front together (npm run dev); Ctrl+C stops both.
import { spawn } from 'node:child_process';

const procs = [
  ['api', 'npm run dev -w api'],
  ['front', 'npm run dev -w front'],
].map(([name, cmd]) => {
  const p = spawn(cmd, { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const prefix = d =>
    d
      .toString()
      .split(/\r?\n/)
      .filter(Boolean)
      .map(l => `[${name}] ${l}`)
      .join('\n') + '\n';
  p.stdout.on('data', d => process.stdout.write(prefix(d)));
  p.stderr.on('data', d => process.stderr.write(prefix(d)));
  p.on('exit', code => {
    console.log(`[${name}] exited (${code})`);
    stopAll();
  });
  return p;
});

let stopping = false;
function stopAll() {
  if (stopping) return;
  stopping = true;
  // shell: true on Windows needs taskkill /T to take down the npm → node tree.
  for (const p of procs) {
    if (p.exitCode !== null) continue;
    if (process.platform === 'win32') spawn('taskkill', ['/PID', String(p.pid), '/T', '/F']);
    else p.kill('SIGTERM');
  }
}
process.on('SIGINT', () => {
  stopAll();
  process.exit(130);
});
