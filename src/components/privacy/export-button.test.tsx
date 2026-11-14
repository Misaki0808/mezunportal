// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DATA_EXPORT_FORMAT_VERSION } from '@/contracts/privacy';
import { renderWithToasts } from '@/test/render';

import messages from '../../../messages/tr.json';

import { ExportButton } from './export-button';

let blobs: Blob[] = [];
const readBlob = (blob: Blob) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });

function respond(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body })),
  );
}

beforeEach(() => {
  blobs = [];
  Object.assign(URL, {
    createObjectURL: vi.fn((blob: Blob) => {
      blobs.push(blob);
      return 'blob:test';
    }),
    revokeObjectURL: vi.fn(),
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ExportButton (kart 372): sunucunun mühürlediği dosya olduğu gibi iner', () => {
  it('"UNREADABLE" işaretli alan dosyayı indirmeyi engellemez ve işaret dosyada kalır', async () => {
    const body = {
      formatVersion: DATA_EXPORT_FORMAT_VERSION,
      exportedAt: '2026-11-14T10:00:00.000Z',
      profile: { completionScore: 'UNREADABLE', headline: 'Başlığım' },
      sonradanEklenenBolum: [{ deger: 1 }],
    };
    respond(200, body);
    const { user } = renderWithToasts(<ExportButton />);
    await user.click(screen.getByRole('button', { name: 'Verilerimi indir' }));
    await waitFor(() => expect(blobs).toHaveLength(1));
    // İstemci yeniden ayrıştırmaz: bilinmeyen anahtar düşmez, işaretli alan hata sayılmaz.
    expect(JSON.parse(await readBlob(blobs[0]!))).toEqual(body);
    expect(screen.queryByText(messages.errors.codes.SERVER_UNEXPECTED)).toBeNull();
  });

  it('yanlış ya da eksik sürüm dosya olarak indirilmez, kararlı hata metni görünür', async () => {
    respond(200, { formatVersion: DATA_EXPORT_FORMAT_VERSION + 1, exportedAt: 'x' });
    const { user } = renderWithToasts(<ExportButton />);
    await user.click(screen.getByRole('button', { name: 'Verilerimi indir' }));
    expect(await screen.findByText(messages.errors.codes.SERVER_UNEXPECTED)).toBeVisible();
    expect(blobs).toHaveLength(0);
  });

  it('sunucu hata kodu (hız sınırı) katalogdaki metne çevrilir, dosya inmez', async () => {
    respond(429, { errorCode: 'RATE_LIMITED' });
    const { user } = renderWithToasts(<ExportButton />);
    await user.click(screen.getByRole('button', { name: 'Verilerimi indir' }));
    expect(await screen.findByText(messages.errors.codes.RATE_LIMITED)).toBeVisible();
    expect(blobs).toHaveLength(0);
  });
});
