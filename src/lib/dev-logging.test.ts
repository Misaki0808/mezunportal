import { expect, it } from 'vitest';
import nextConfig from '../../next.config';
import { nextLogging } from './dev-logging';

it('geliştirmede eylem argümanları ve bütün istek URL günlükleri kapalıdır', () => {
  expect(nextConfig.logging).toEqual(nextLogging);
  expect(nextLogging.serverFunctions).toBe(false);
  expect(nextLogging.incomingRequests).toBe(false);
});
