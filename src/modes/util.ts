import type { HudField } from '../engine/types.js';

export const pad2 = (n: number): string =>
  String(Math.max(0, Math.floor(n))).padStart(2, '0');

/** `MM:SS`, clamped at zero. */
export const formatTime = (seconds: number): string => {
  const total = Math.max(0, Math.floor(seconds));
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
};

export const timeRow = (label: string, seconds: number): HudField => ({
  label,
  value: formatTime(seconds),
});

export const levelRow = (level: number): HudField => ({ label: 'LEVEL', value: String(level) });

export const goalRow = (value: number | string): HudField => ({
  label: 'GOAL',
  value: String(value),
});

export const linesRow = (lines: number): HudField => ({ label: 'LINES', value: String(lines) });
