import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ provider: 'openai-compatible' as string | undefined }));
vi.mock('@/lib/env', () => ({
  getLlmEnv: () => ({
    LLM_PROVIDER: state.provider,
    LLM_BASE_URL: 'http://127.0.0.1:11434/v1',
    LLM_MODEL: 'test',
  }),
}));
beforeEach(() => vi.resetModules());
it('gerçek seçimi maskeli metin adaptörüne, fake ve boş seçim mevcut davranışa bağlanır', async () => {
  state.provider = 'openai-compatible';
  const real = await import('./index');
  expect(real.getLlm()).toMatchObject({ provider: 'openai-compatible' });
  expect(real.getLlm()?.parseRedactedCv).toBeTypeOf('function');
  vi.resetModules();
  state.provider = 'fake';
  expect((await import('./index')).getLlm()?.provider).toBe('fake');
  vi.resetModules();
  state.provider = undefined;
  expect((await import('./index')).getLlm()).toBeNull();
});
