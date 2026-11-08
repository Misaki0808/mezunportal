import { LlmError, type LlmAdapter, type LlmCvRequest } from './types';

/**
 * Sahte LLM adaptörü (deterministik; testler ve yerel geliştirme). PDF'in ilk baytlarındaki `%FAKE-CV:<kimlik>`
 * işaretinden senaryoyu seçer; işaret yoksa `demo` çıktısını verir (yerelde yükleme akışı denenebilsin diye).
 * Başarı, zaman aşımı, kesinti, geçersiz çıktı ve prompt-injection senaryolarını üretebilir. Çağrı sayısını
 * tutar ama CV içeriğini ya da çıktısını SAKLAMAZ/LOGLAMAZ.
 */

export type FakeScenarioFn = (request: LlmCvRequest, callIndex: number) => unknown;
/** Sabit çıktı (nesne) ya da çağrıdan çıktı üreten işlev. */
export type FakeScenario = FakeScenarioFn | object;

export const DEMO_CV_OUTPUT = {
  education: [
    {
      institution: 'Örnek Üniversitesi',
      level: 'BACHELOR',
      fieldOfStudy: 'Yönetim Bilişim Sistemleri',
      startDate: '2021-09',
      endDate: null,
      isCurrent: true,
    },
  ],
  positions: [
    {
      company: 'Örnek Yazılım A.Ş.',
      title: 'Yazılım Stajyeri',
      employmentType: 'INTERNSHIP',
      startDate: '2024-07',
      endDate: '2024-09',
      isCurrent: false,
      description: 'Örnek bir staj açıklaması.',
    },
  ],
  skills: ['TypeScript', 'SQL'],
  languages: [{ name: 'İngilizce', level: 'B2' }],
  certifications: [],
} as const;

const MARKER = /%FAKE-CV:([a-z0-9-]{1,64})/;

export function scenarioOf(pdf: Uint8Array): string {
  const head = Buffer.from(pdf.subarray(0, 4096)).toString('latin1');
  return MARKER.exec(head)?.[1] ?? 'demo';
}

export type FakeLlm = LlmAdapter & {
  /** Toplam `parseCv` çağrı sayısı ("rıza yoksa çağrı yok" testleri için). */
  readonly calls: number;
  /** Çağrılan senaryo kimlikleri (içerik değil). */
  readonly scenarios: readonly string[];
  reset(): void;
};

export function createFakeLlm(options: { scenarios?: Record<string, FakeScenario> } = {}): FakeLlm {
  const custom = options.scenarios ?? {};
  const log: string[] = [];
  const perScenario = new Map<string, number>();

  return {
    provider: 'fake',
    get calls() {
      return log.length;
    },
    get scenarios() {
      return log;
    },
    reset() {
      log.length = 0;
      perScenario.clear();
    },
    async parseCv(request) {
      const scenario = scenarioOf(request.pdf);
      log.push(scenario);
      const callIndex = perScenario.get(scenario) ?? 0;
      perScenario.set(scenario, callIndex + 1);
      if (request.signal.aborted) throw new LlmError('TIMEOUT');

      switch (scenario) {
        case 'timeout':
          throw new LlmError('TIMEOUT');
        case 'unavailable':
          throw new LlmError('UNAVAILABLE');
        case 'rejected':
          throw new LlmError('REJECTED');
        case 'slow':
          // İptal sinyali gelene kadar bekler (gerçek adaptörün zaman aşımı davranışı).
          await new Promise<void>((resolve) =>
            request.signal.addEventListener('abort', () => resolve(), { once: true }),
          );
          throw new LlmError('TIMEOUT');
        case 'invalid':
          return { positions: 'bu bir liste değil', skills: 42 };
        case 'invalid-once':
          return callIndex === 0 ? { education: [{ institution: '' }] } : DEMO_CV_OUTPUT;
        case 'empty':
          return {};
        case 'demo':
          return custom.demo === undefined
            ? DEMO_CV_OUTPUT
            : resolve(custom.demo, request, callIndex);
        default: {
          const output = custom[scenario];
          if (output === undefined) return DEMO_CV_OUTPUT;
          return resolve(output, request, callIndex);
        }
      }
    },
  };
}

function resolve(scenario: FakeScenario, request: LlmCvRequest, callIndex: number): unknown {
  return typeof scenario === 'function' ? scenario(request, callIndex) : scenario;
}
