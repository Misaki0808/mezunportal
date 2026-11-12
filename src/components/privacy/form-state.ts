'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { z } from 'zod';
import type { ActionFailure, ActionResult } from '@/contracts/result';
import { failureFromZod } from '@/lib/action-result';
import { useAction } from '@/components/ui';

export function usePrivacyForm() {
  const [validation, setValidation] = useState<ActionFailure | null>(null);
  const action = useAction();
  const codes = useTranslations('errors.codes');
  const failure = validation ?? action.failure;
  function parse<T>(schema: z.ZodType<T>, input: unknown): T | null {
    const result = schema.safeParse(input);
    action.clear();
    if (!result.success) {
      setValidation(failureFromZod(result.error));
      return null;
    }
    setValidation(null);
    return result.data;
  }
  async function run<T>(
    operation: () => Promise<ActionResult<T>>,
    success: (data: T) => void | Promise<void>,
    message?: string,
    onFailure?: (failure: ActionFailure) => void,
  ) {
    setValidation(null);
    return action.run(operation, { onOk: success, success: message, onFailure });
  }
  return {
    failure,
    busy: action.busy,
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
