import { describe, it, expect } from 'vitest';
import { formatDuration, renderBar } from '../../src/extraction/progress.ts';

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

describe('progress', () => {
  it('formats durations', () => {
    expect(formatDuration(5)).toBe('5s');
    expect(formatDuration(252)).toBe('4m12s');
    expect(formatDuration(3725)).toBe('1h02m');
  });
  it('renders percentage, counts and ETA', () => {
    const line = stripAnsi(renderBar('OCR', 500, 2000, 100, 20));
    expect(line).toContain('25.0%');
    expect(line).toContain('OCR 500/2000');
    expect(line).toContain('ETA 5m00s');
    expect(line).toContain('█'.repeat(5) + '░'.repeat(15));
  });
  it('handles zero total and completion', () => {
    expect(stripAnsi(renderBar('Frames', 0, 0, 0, 10))).toContain('0.0%');
    expect(stripAnsi(renderBar('OCR', 10, 10, 30, 10))).toContain('100.0%');
  });
});
