import { test, expect } from 'bun:test';
import { CARS, getCar } from '../src/core/Cars';
import { FormulaDynamics } from '../src/core/FormulaDynamics';

const accelerate = (id: keyof typeof CARS, seconds: number) => {
  const car = CARS[id];
  const dynamics = new FormulaDynamics(car.performance);
  const input = { dt: 1 / 60, drive: 1, steering: 0, braking: false, offroad: false, topSpeed: car.performance?.topSpeed ?? 94 };
  for (let frame = 0; frame < seconds * 60; frame++) dynamics.update(0, input);
  return dynamics;
};

test('Model Y is the third selectable vehicle and survives URL selection', () => {
  expect(Object.keys(CARS)).toHaveLength(3);
  expect(getCar('model-y')).toBe(CARS['model-y']);
  expect(getCar('unknown')).toBe(CARS.formula);
});

test('Model Y accelerates substantially slower than either Formula car', () => {
  const tesla = accelerate('model-y', 8).result.speed;
  expect(tesla).toBeGreaterThan(15);
  expect(tesla).toBeLessThan(accelerate('formula', 8).result.speed * 0.75);
  expect(tesla).toBeLessThan(accelerate('retro-force', 8).result.speed * 0.75);
});

test('Model Y reaches its game speed limit without exceeding it', () => {
  const speed = accelerate('model-y', 120).result.speed;
  expect(speed * 3.6).toBeLessThanOrEqual(210.001);
  expect(speed * 3.6).toBeGreaterThan(208);
  expect(accelerate('formula', 120).result.speed).toBeGreaterThan(speed * 1.4);
});

test('Road-car braking is weaker and it has less aero grip', () => {
  const road = new FormulaDynamics(CARS['model-y'].performance);
  const formula = new FormulaDynamics();
  for (const dynamics of [road, formula]) dynamics.velocity.set(0, 0, -40);
  const input = { dt: 1 / 60, drive: 0, steering: 0, braking: true, offroad: false, topSpeed: 94 };
  for (let i = 0; i < 60; i++) {
    road.update(0, { ...input, topSpeed: CARS['model-y'].performance!.topSpeed });
    formula.update(0, input);
  }
  expect(road.result.speed).toBeGreaterThan(formula.result.speed);
  expect(road.result.aeroLoad).toBeLessThan(0.08);
});
