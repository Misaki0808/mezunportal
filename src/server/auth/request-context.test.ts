import { describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

import { clientIpFrom } from './request-context';

const h = (values: Record<string, string>) => new Headers(values);

describe('clientIpFrom', () => {
  it.each([
    [{ 'x-forwarded-for': '203.0.113.7' }, '203.0.113.7'],
    [{ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }, '203.0.113.7'],
    [{ 'x-real-ip': '198.51.100.4' }, '198.51.100.4'],
    [{ 'x-forwarded-for': '2001:db8::1' }, '2001:db8::1'],
    [{}, null],
    [{ 'x-forwarded-for': 'sahte; DROP TABLE' }, null],
    [{ 'x-forwarded-for': '<script>' }, null],
    [{ 'x-forwarded-for': '' }, null],
  ])('%j → %j', (headers, ip) => {
    expect(clientIpFrom(h(headers))).toBe(ip);
  });
});
