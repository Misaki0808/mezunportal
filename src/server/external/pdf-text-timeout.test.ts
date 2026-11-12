import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import { buildRealTestPdf } from '@/test/real-pdf';

const state = vi.hoisted(() => ({ terminate: vi.fn().mockResolvedValue(0) }));
vi.mock('node:worker_threads', () => ({
  Worker: class extends EventEmitter {
    stdout = { resume: vi.fn() };
    stderr = { resume: vi.fn() };
    terminate = state.terminate;
  },
}));
import { getPdfTextExtractor } from './pdf-text';
afterEach(() => vi.useRealTimers());
it('süre aşımında iş parçacığını sonlandırır ve kararlı kod döndürür', async () => {
  vi.useFakeTimers();
  const result = getPdfTextExtractor().extract(buildRealTestPdf(['Sample']));
  const rejected = expect(result).rejects.toMatchObject({ code: 'CV_PARSE_TIMEOUT' });
  await vi.advanceTimersByTimeAsync(5000);
  await rejected;
  expect(state.terminate).toHaveBeenCalledOnce();
});
