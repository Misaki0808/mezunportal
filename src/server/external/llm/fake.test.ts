import { describe, expect, it } from 'vitest';

import { buildTestPdf } from '@/test/pdf';
import { parsedCvSchema } from '@/contracts/cv';

import { DEMO_CV_OUTPUT, createFakeLlm, scenarioOf } from './fake';
import { LlmError, type LlmCvRequest } from './types';

const request = (scenario?: string, signal = new AbortController().signal): LlmCvRequest => ({
  pdf: buildTestPdf(scenario ? { scenario } : {}),
  instruction: 'talimat',
  schema: {},
  signal,
});

describe('sahte LLM adaptörü', () => {
  it('işaret yoksa demo çıktısı verir (yerelde yükleme akışı denenebilir) ve şemaya uyar', async () => {
    const llm = createFakeLlm();
    expect(scenarioOf(request().pdf)).toBe('demo');
    expect(parsedCvSchema.safeParse(await llm.parseCv(request())).success).toBe(true);
    expect(await llm.parseCv(request())).toEqual(DEMO_CV_OUTPUT);
  });

  it('senaryo PDF işaretinden seçilir; özel senaryolar sabit çıktı ya da işlev olabilir', async () => {
    const llm = createFakeLlm({
      scenarios: {
        sabit: { skills: ['SQL'] },
        islev: (_r, call) => ({ skills: [`çağrı-${call}`] }),
      },
    });
    expect(await llm.parseCv(request('sabit'))).toEqual({ skills: ['SQL'] });
    expect(await llm.parseCv(request('islev'))).toEqual({ skills: ['çağrı-0'] });
    expect(await llm.parseCv(request('islev'))).toEqual({ skills: ['çağrı-1'] });
    expect(llm.calls).toBe(3);
    expect(llm.scenarios).toEqual(['sabit', 'islev', 'islev']);
  });

  it.each([
    ['timeout', 'TIMEOUT', true],
    ['unavailable', 'UNAVAILABLE', true],
    ['rejected', 'REJECTED', false],
  ] as const)(
    '%s senaryosu %s LlmError fırlatır (yeniden denenebilir: %s)',
    async (scenario, code, retryable) => {
      const llm = createFakeLlm();
      const error = await llm.parseCv(request(scenario)).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(LlmError);
      expect(error).toMatchObject({ code, retryable });
      expect(String((error as Error).message)).not.toMatch(/pdf|%PDF/i);
    },
  );

  it('slow senaryosu iptal sinyaliyle TIMEOUT olur; önceden iptal edilmiş sinyal hemen TIMEOUT', async () => {
    const llm = createFakeLlm();
    const controller = new AbortController();
    const pending = llm.parseCv(request('slow', controller.signal));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'TIMEOUT' });
    const aborted = new AbortController();
    aborted.abort();
    await expect(llm.parseCv(request('demo', aborted.signal))).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
  });

  it('invalid-once ilk çağrıda geçersiz, sonra geçerli çıktı verir; reset sayaçları sıfırlar', async () => {
    const llm = createFakeLlm();
    expect(parsedCvSchema.safeParse(await llm.parseCv(request('invalid-once'))).success).toBe(
      false,
    );
    expect(parsedCvSchema.safeParse(await llm.parseCv(request('invalid-once'))).success).toBe(true);
    llm.reset();
    expect(llm.calls).toBe(0);
    expect(parsedCvSchema.safeParse(await llm.parseCv(request('invalid-once'))).success).toBe(
      false,
    );
  });

  it('çağrı kaydı yalnız senaryo kimliğini tutar, PDF içeriğini değil', async () => {
    const llm = createFakeLlm();
    await llm.parseCv(request('demo'));
    expect(JSON.stringify(llm.scenarios)).toBe('["demo"]');
  });
});
