const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
}

export function renderBar(label: string, done: number, total: number, elapsedSec: number, width = 30): string {
  const ratio = total > 0 ? Math.min(1, done / total) : 0;
  const filled = Math.round(ratio * width);
  const bar = `${GREEN}${'█'.repeat(filled)}${RESET}${DIM}${'░'.repeat(width - filled)}${RESET}`;
  const eta = done > 0 && done < total ? `  ETA ${formatDuration((elapsedSec / done) * (total - done))}` : '';
  return `${bar} ${BOLD}${(ratio * 100).toFixed(1).padStart(5)}%${RESET}  ${label} ${done}/${total}  ${DIM}${formatDuration(elapsedSec)}${eta}${RESET}`;
}

export type OnProgress = (stage: string, done: number, total: number) => void;

/** Redraws one ANSI progress line per stage on a TTY; falls back to a line every 10% when piped. */
export function createProgress(stream: NodeJS.WriteStream = process.stdout): OnProgress & { end(): void } {
  let stage = '',
    started = Date.now(),
    lastDecile = -1;
  const update = (s: string, done: number, total: number) => {
    if (s !== stage) {
      if (stage && stream.isTTY) stream.write('\n');
      stage = s;
      started = Date.now();
      lastDecile = -1;
    }
    const line = renderBar(s, done, total, (Date.now() - started) / 1000);
    if (stream.isTTY) stream.write(`\r\x1b[2K${line}`);
    else {
      const decile = total > 0 ? Math.floor((done / total) * 10) : 0;
      if (decile !== lastDecile) {
        lastDecile = decile;
        stream.write(`${line.replace(/\x1b\[[0-9;]*m/g, '')}\n`);
      }
    }
  };
  return Object.assign(update, {
    end: () => {
      if (stage && stream.isTTY) stream.write('\n');
      stage = '';
    },
  });
}
