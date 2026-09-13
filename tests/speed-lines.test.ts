import { test, expect } from 'bun:test';
import { Vector3 } from 'three';
import { SpeedLines } from '../src/scene/SpeedLines';

const CORRIDOR = 3.2;
const origin = new Vector3();

/** Runs the effect at a fixed speed and reports what a viewer would actually see. */
const settle = (speed: number, lateralG = 0, frames = 90) => {
  const lines = new SpeedLines(94);
  for (let frame = 0; frame < frames; frame++) lines.update(origin, 0, speed, lateralG, 1 / 60);
  const mesh = lines.root.children[0] as any;
  const position = mesh.geometry.getAttribute('position').array as Float32Array;
  const color = mesh.geometry.getAttribute('color').array as Float32Array;

  let longest = 0;
  let litStreaks = 0;
  let minCorridor = Infinity;
  for (let i = 0; i < position.length; i += 12) {
    const dx = position[i + 9] - position[i];
    const dz = position[i + 11] - position[i + 2];
    longest = Math.max(longest, Math.hypot(dx, dz));
    if (color[i + 3] > 0.001) litStreaks++;
    minCorridor = Math.min(minCorridor, Math.abs(position[i]));
  }
  return { lines, longest, litStreaks, minCorridor, opacity: mesh.material.opacity, visible: lines.root.visible };
};

test('stays hidden below the wind-line threshold and appears above it', () => {
  expect(settle(12).visible).toBe(false);
  expect(settle(40).visible).toBe(true);
});

test('streaks stretch and brighten as speed climbs', () => {
  const slow = settle(30);
  const fast = settle(85);
  expect(fast.longest).toBeGreaterThan(slow.longest * 2);
  expect(fast.opacity).toBeGreaterThan(slow.opacity);
});

test('more streaks switch on at higher speed', () => {
  expect(settle(85).litStreaks).toBeGreaterThan(settle(30).litStreaks);
});

test('cornering load rakes the streaks sideways', () => {
  const straight = settle(80, 0);
  const cornering = settle(80, 4.5);
  const read = (run: { lines: SpeedLines }) => {
    const array = (run.lines.root.children[0] as any).geometry.getAttribute('position').array as Float32Array;
    return array[9] - array[0];
  };
  expect(Math.abs(read(straight))).toBeLessThan(1e-6);
  expect(read(cornering)).toBeGreaterThan(1);
});

test('keeps a clear corridor so streaks never cut through the car', () => {
  expect(settle(85).minCorridor).toBeGreaterThanOrEqual(CORRIDOR);
});

test('dispose tears down the group and stops updating', () => {
  const lines = new SpeedLines(94);
  lines.update(origin, 0, 80, 0, 1 / 60);
  lines.dispose();
  expect(() => lines.update(origin, 0, 80, 0, 1 / 60)).not.toThrow();
});

test('the ramp scales to each car, so both use their whole speed range', () => {
  const peak = (topSpeed: number, speed: number) => {
    const lines = new SpeedLines(topSpeed);
    for (let frame = 0; frame < 90; frame++) lines.update(origin, 0, speed, 0, 1 / 60);
    return (lines.root.children[0] as any).material.opacity;
  };
  // A road car at its own limit reads as fast as an F1 car at its limit...
  expect(peak(58, 58)).toBeCloseTo(peak(94, 94), 3);
  // ...but at the same absolute speed the F1 car, still mid-range, reads calmer.
  expect(peak(94, 55)).toBeLessThan(peak(58, 55));
});
