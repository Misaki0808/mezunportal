import { describe, expect, it, vi } from 'vitest';
import { parsedCvJsonSchema, parsedCvSchema } from '@/contracts/cv';
import { isLinkedinPdfReady } from '@/server/services/cv-shared';
import { createOpenAiCompatibleLlm, OPENAI_COMPATIBLE_TIMEOUT_MS } from './openai-compatible';
import { LlmError, type RedactedCvRequest } from './types';

const secret = 'secret-key-test-only';
const text = 'Örnek CV gizli veri';
const request = (signal = new AbortController().signal): RedactedCvRequest => ({
  text,
  instruction: 'Extract safely',
  schema: parsedCvJsonSchema(),
  signal,
});
const ok = (content: unknown) => Response.json({ choices: [{ message: { content } }] });
const adapter = (fetchImpl: typeof fetch) =>
  createOpenAiCompatibleLlm({
    baseUrl: 'http://127.0.0.1:11434/v1/',
    model: 'synthetic',
    apiKey: secret,
    fetchImpl,
  });

describe('OpenAI uyumlu LLM', () => {
  it('yalnız maskeli metin ve strict şemayla çağırır, şema doğrulamasını servise bırakır', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(ok('{"skills":["SQL"]}'));
    const llm = adapter(fetchImpl);
    const input = request();
    expect(await llm.parseRedactedCv!(input)).toEqual({ skills: ['SQL'] });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('http://127.0.0.1:11434/v1/chat/completions');
    expect(init?.signal).toBe(input.signal);
    expect(init?.redirect).toBe('error');
    expect(init?.headers).toMatchObject({ authorization: `Bearer ${secret}` });
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      model: 'synthetic',
      temperature: 0,
      stream: false,
      messages: [
        { role: 'system', content: input.instruction },
        { role: 'user', content: text },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'cv', strict: true } },
    });
    const schema = body.response_format.json_schema.schema;
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(Object.keys(schema.properties));
    expect(schema.properties.education.items.additionalProperties).toBe(false);
    expect(schema.properties.education.items.required).toEqual(
      Object.keys(schema.properties.education.items.properties),
    );
    expect(input.schema).not.toHaveProperty('required');
    expect(llm.timeoutMs).toBe(OPENAI_COMPATIBLE_TIMEOUT_MS);
    expect(
      isLinkedinPdfReady({
        llm,
        pdfTextExtractor: { kind: 'real', extract: async () => '', redact: async (s) => s },
      }),
    ).toBe(true);
  });
  it('ham PDF girişini reddeder ve ağ isteği yapmaz', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(
      adapter(fetchImpl).parseCv({ ...request(), pdf: new Uint8Array([1]) }),
    ).rejects.toMatchObject({ code: 'REJECTED' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('şema dışı JSON değerini olduğu gibi döndürür; servis sözleşmesi reddeder', async () => {
    const llm = adapter(vi.fn<typeof fetch>().mockResolvedValue(ok('{"skills":42}')));
    const output = await llm.parseRedactedCv!(request());
    expect(parsedCvSchema.safeParse(output).success).toBe(false);
  });
  it.each([
    [429, 'UNAVAILABLE'],
    [500, 'UNAVAILABLE'],
    [503, 'UNAVAILABLE'],
    [400, 'REJECTED'],
    [401, 'REJECTED'],
    [403, 'REJECTED'],
  ] as const)('HTTP %i → %s; yanıt içeriği ve anahtar hataya girmez', async (status, code) => {
    const llm = adapter(
      vi.fn<typeof fetch>().mockResolvedValue(new Response(`${secret} ${text}`, { status })),
    );
    const error = await llm.parseRedactedCv!(request()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LlmError);
    expect(error).toMatchObject({ code });
    expect(String(error)).not.toContain(secret);
    expect(String(error)).not.toContain(text);
  });
  it.each([null, '', 'not json'])('boş veya JSON olmayan içerik reddedilir', async (content) => {
    await expect(
      adapter(vi.fn<typeof fetch>().mockResolvedValue(ok(content))).parseRedactedCv!(request()),
    ).rejects.toMatchObject({ code: 'REJECTED' });
  });
  it('hatalı taşıma JSON ve ağ hatası sızıntısızdır', async () => {
    const invalid = adapter(vi.fn<typeof fetch>().mockResolvedValue(new Response('not json')));
    await expect(invalid.parseRedactedCv!(request())).rejects.toMatchObject({ code: 'REJECTED' });
    const broken = adapter(vi.fn<typeof fetch>().mockRejectedValue(new Error(`${secret} ${text}`)));
    const error = await broken.parseRedactedCv!(request()).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'UNAVAILABLE' });
    expect(String(error)).not.toContain(secret);
    expect(String(error)).not.toContain(text);
  });
  it('önceden iptal, gecikmeli iptal ve zaman aşımı TIMEOUT olur', async () => {
    const pre = new AbortController();
    pre.abort();
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(adapter(fetchImpl).parseRedactedCv!(request(pre.signal))).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    const controller = new AbortController();
    const pendingFetch = vi
      .fn<typeof fetch>()
      .mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) =>
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('cancel', 'AbortError')),
            ),
          ),
      );
    const pending = adapter(pendingFetch).parseRedactedCv!(request(controller.signal));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'TIMEOUT' });
    await expect(
      adapter(vi.fn<typeof fetch>().mockRejectedValue(new DOMException('timeout', 'TimeoutError')))
        .parseRedactedCv!(request()),
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
  it('anahtar yoksa Authorization başlığı eklemez', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(ok('{}'));
    await createOpenAiCompatibleLlm({
      baseUrl: 'http://localhost:11434/v1',
      model: 'local',
      fetchImpl,
    }).parseRedactedCv!(request());
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).not.toHaveProperty('authorization');
  });
});
