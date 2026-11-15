import 'server-only';

import { getLlmEnv } from '@/lib/env';

import { createFakeLlm } from './fake';
import { createOpenAiCompatibleLlm } from './openai-compatible';
import type { LlmAdapter } from './types';

export { LlmError } from './types';
export type { LlmAdapter, LlmCvRequest, LlmErrorCode } from './types';
export { createFakeLlm } from './fake';
export { CV_SYSTEM_INSTRUCTION } from './prompt';

let cached: LlmAdapter | null | undefined;

/**
 * Env'e göre adaptör (tembel; import anında env okunmaz). `LLM_PROVIDER` boşsa `null`: CV ayrıştırma kapalıdır.
 * Canlı sağlayıcı seçimi K-04 kararına bağlıdır.
 */
export function getLlm(): LlmAdapter | null {
  if (cached === undefined) {
    const env = getLlmEnv();
    cached =
      env.LLM_PROVIDER === 'fake'
        ? createFakeLlm()
        : env.LLM_PROVIDER === 'openai-compatible'
          ? createOpenAiCompatibleLlm({
              baseUrl: env.LLM_BASE_URL!,
              model: env.LLM_MODEL!,
              apiKey: env.LLM_API_KEY,
            })
          : null;
  }
  return cached;
}

export function isLlmConfigured(): boolean {
  return getLlm() !== null;
}
