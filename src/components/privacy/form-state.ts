'use client';
import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { z } from 'zod';
import type { ActionFailure, ActionResult } from '@/contracts/result';
import { failureFromZod } from '@/lib/action-result';
import { useToast } from '@/components/ui';

export function usePrivacyForm() {
  const [failure, setFailure] = useState<ActionFailure | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const codes = useTranslations('errors.codes');
  const toast = useToast();
  function parse<T>(schema: z.ZodType<T>, input: unknown): T | null {
    const result = schema.safeParse(input);
    if (!result.success) {
      setFailure(failureFromZod(result.error));
      return null;
    }
    setFailure(null);
    return result.data;
  }
  async function run<T>(
    action: () => Promise<ActionResult<T>>,
    success: (data: T) => void | Promise<void>,
    message?: string,
  ) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setFailure(null);
    try {
      const result = await action();
      if (!result.ok) {
        setFailure(result);
        return;
      }
      await success(result.data);
      if (message) toast.show({ message, tone: 'success' });
    } catch {
      setFailure({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return {
    failure,
    busy,
    parse,
    run,
    error: failure
      ? codes(
          failure.errorCode,
          failure.params
            ? Object.fromEntries(
                Object.entries(failure.params).map(([key, value]) => [
                  key,
                  typeof value === 'boolean' ? String(value) : value,
                ]),
              )
            : undefined,
        )
      : undefined,
    fieldError: (field: string) => {
      const code = failure?.fieldErrors?.[field];
      return code ? codes(code) : undefined;
    },
  };
}
