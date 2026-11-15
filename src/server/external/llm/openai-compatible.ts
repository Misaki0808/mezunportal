import 'server-only';

import type { LlmAdapter, RedactedCvRequest } from './types';
import { LlmError } from './types';

/** Yerel modelin ilk yüklenmesi ve çıkarımı için tek çağrı bütçesi. */
export const OPENAI_COMPATIBLE_TIMEOUT_MS = 90_000;

type Options = { baseUrl: string; model: string; apiKey?: string; fetchImpl?: typeof fetch };

/** Strict Structured Outputs bütün alanları zorunlu ve nesneleri kapalı ister; asıl doğrulama servistedir. */
function strictSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strictSchema);
  if (!value || typeof value !== 'object') return value;
  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(input)) {
    // Sağlayıcıların ortak şema alt kümesi: sayısal/metin sınırları servis Zod doğrulamasında korunur.
    if (
      ['$schema', 'default', 'minLength', 'maxLength', 'pattern', 'minItems', 'maxItems'].includes(
        key,
      )
    )
      continue;
    output[key] = strictSchema(entry);
  }
  if (input.type === 'object' && input.properties && typeof input.properties === 'object') {
    output.additionalProperties = false;
    output.required = Object.keys(input.properties);
  }
  return output;
}

export function createOpenAiCompatibleLlm(options: Options): LlmAdapter {
  const endpoint = `${options.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    provider: 'openai-compatible',
    timeoutMs: OPENAI_COMPATIBLE_TIMEOUT_MS,
    async parseCv() {
      // Gerçek sağlayıcıya hiçbir koşulda PDF veya sahibi gönderilmez.
      throw new LlmError('REJECTED');
    },
    async parseRedactedCv(request: RedactedCvRequest): Promise<unknown> {
      if (request.signal.aborted) throw new LlmError('TIMEOUT');
      let response: Response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          redirect: 'error',
          headers: {
            'content-type': 'application/json',
            ...(options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {}),
          },
          body: JSON.stringify({
            model: options.model,
            temperature: 0,
            stream: false,
            messages: [
              { role: 'system', content: request.instruction },
              { role: 'user', content: request.text },
            ],
            response_format: {
              type: 'json_schema',
              json_schema: { name: 'cv', strict: true, schema: strictSchema(request.schema) },
            },
          }),
          signal: request.signal,
        });
      } catch (error) {
        if (
          request.signal.aborted ||
          (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name))
        )
          throw new LlmError('TIMEOUT');
        throw new LlmError('UNAVAILABLE');
      }
      if (!response.ok)
        throw new LlmError(
          response.status === 429 || response.status >= 500 ? 'UNAVAILABLE' : 'REJECTED',
        );
      let payload: unknown;
      try {
        payload = await response.json();
      } catch (error) {
        if (
          request.signal.aborted ||
          (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name))
        )
          throw new LlmError('TIMEOUT');
        throw new LlmError(error instanceof SyntaxError ? 'REJECTED' : 'UNAVAILABLE');
      }
      const choices = (payload as { choices?: unknown })?.choices;
      const content = Array.isArray(choices) ? choices[0]?.message?.content : undefined;
      if (typeof content !== 'string' || !content.trim()) throw new LlmError('REJECTED');
      try {
        return JSON.parse(content) as unknown;
      } catch {
        throw new LlmError('REJECTED');
      }
    },
  };
}
