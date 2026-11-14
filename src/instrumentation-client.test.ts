import { expect, it } from 'vitest';
import { z } from 'zod';
import './instrumentation-client';

it('istemci başlangıcında Zod eval kullanmadan doğrular', () => {
  expect(z.config().jitless).toBe(true);
  const schema = z.object({ email: z.email(), year: z.number().int().min(1900) });
  expect(schema.safeParse({ email: 'gecersiz', year: 1899 }).success).toBe(false);
  expect(schema.safeParse({ email: 'deneme@example.test', year: 2024 }).success).toBe(true);
});
