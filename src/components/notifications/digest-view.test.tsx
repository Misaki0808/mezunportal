// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { createTranslator } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { ambiguousLinkNames } from '@/test/link-names';
import '@/test/render'; // jest-dom eşleştiricileri ve her testten sonra temizlik

import messages from '../../../messages/tr.json';

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) =>
    createTranslator({ locale: 'tr', messages, namespace: namespace as 'monthlyDigest' }),
}));

import { DigestView } from './digest-view';

type Digest = Parameters<typeof DigestView>[0]['digest'];
const digest = (extra: Record<string, unknown>) =>
  ({
    experiences: [],
    jobs: [],
    applicationWindows: [],
    events: [],
    contribution: null,
    ...extra,
  }) as unknown as Digest;
const show = async (value: Digest) => render(await DigestView({ digest: value }));

describe('aylık özet: bağlantı adları', () => {
  it('bir bölümde aynı görünür metin sıra numarasıyla ayrılır, tek olan düz kalır', async () => {
    await show(
      digest({
        experiences: [
          { id: 'e1', label: 'Staj' },
          { id: 'e2', label: 'Staj' },
          { id: 'e3', label: 'Erasmus' },
        ],
      }),
    );
    expect(screen.getByRole('link', { name: 'Staj, 1/2' })).toHaveAttribute('href', '/deneyim/e1');
    expect(screen.getByRole('link', { name: 'Staj, 2/2' })).toHaveAttribute('href', '/deneyim/e2');
    expect(screen.getByRole('link', { name: 'Erasmus' })).toHaveAttribute('href', '/deneyim/e3');
    expect(ambiguousLinkNames()).toEqual([]);
  });

  it('bölümler arası aynı ad (deneyim türü "Staj" + adı "Staj" olan etkinlik) farklı hedefle karışmaz', async () => {
    await show(
      digest({
        experiences: [{ id: 'exp', label: 'Staj' }],
        events: [{ id: 'ev', label: 'Staj' }],
      }),
    );
    expect(screen.getByRole('link', { name: 'Staj, 1/2' })).toHaveAttribute('href', '/deneyim/exp');
    expect(screen.getByRole('link', { name: 'Staj, 2/2' })).toHaveAttribute('href', '/etkinlikler');
    expect(ambiguousLinkNames()).toEqual([]);
  });

  it('sayfa genelinde tek olan ad ek numara almaz', async () => {
    await show(
      digest({
        experiences: [{ id: 'exp', label: 'Staj' }],
        events: [{ id: 'ev', label: 'Kariyer günü' }],
      }),
    );
    expect(screen.getByRole('link', { name: 'Staj' })).toHaveAttribute('href', '/deneyim/exp');
    expect(screen.getByRole('link', { name: 'Kariyer günü' })).toHaveAttribute(
      'href',
      '/etkinlikler',
    );
  });
});
