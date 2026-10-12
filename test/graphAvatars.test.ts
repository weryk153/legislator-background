import { expect, it } from 'vitest';
import { shouldLoadGraphAvatar as load } from '../src/lib/graphAvatars';
const viewport = { width: 800, height: 500 };
it('skips tiny overview dots, hidden nodes and off-canvas portraits', () => {
  expect(load({ x: 200, y: 100 }, 12, viewport)).toBe(false);
  expect(load({ x: 200, y: 100 }, 40, viewport, false)).toBe(false);
  expect(load({ x: 900, y: 100 }, 40, viewport)).toBe(false);
  expect(load({ x: 100, y: -40 }, 40, viewport)).toBe(false);
});
it('loads readable portraits including nodes partially inside the viewport', () => {
  expect(load({ x: 200, y: 100 }, 18, viewport)).toBe(true);
  expect(load({ x: -10, y: 100 }, 40, viewport)).toBe(true);
  expect(load({ x: 810, y: 100 }, 40, viewport)).toBe(true);
});
