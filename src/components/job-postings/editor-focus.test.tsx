// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { JobPostingFormContext } from '@/contracts/job-postings';
import { renderWithToasts } from '@/test/render';

import { PostingEditor } from './editor';
import { addDays, istanbulDay } from './model';

// Sayfa değişimini taklit eder: `push` çağrılınca kısa bir süre sonra düzenleyici kalkar, "İlanlarım" sayfası gelir.
const nav = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  go: undefined as undefined | (() => void),
}));
vi.mock('next/navigation', () => ({ useRouter: () => nav }));

const context: JobPostingFormContext = {
  authorDepartments: [{ id: 'dep', name: 'YBS' }],
  availableTags: [],
  targetDepartments: [{ id: 'dep', name: 'YBS', facultyName: 'İşletme' }],
  limits: { maxDays: 60, submitLimit: 5, submitWindowDays: 30, maxTargets: 10 },
};
const initial = {
  id: 'job-1',
  status: 'PENDING' as const,
  kind: 'INTERNSHIP' as const,
  title: 'Yazılım stajyeri',
  organizationName: 'Kurum',
  companyId: null,
  location: 'İstanbul',
  isRemote: false,
  description: 'Öğrenciler için gerçek projelerde öğrenme fırsatı sunan örnek bir staj.',
  applyMethod: 'URL' as const,
  applyUrl: 'https://example.org',
  deadlineOn: addDays(istanbulDay(), 14),
  departmentId: 'dep',
  targetDepartments: [{ id: 'dep', name: 'YBS' }],
  tagIds: [],
  targetGrades: [],
  moderationNote: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  submittedAt: null,
  publishedAt: null,
  endedAt: null,
  author: { displayName: 'Yetkili kişi', role: 'ALUMNI' as const },
};

function Pages({ save, submit }: { save: () => Promise<unknown>; submit: () => Promise<unknown> }) {
  const [page, setPage] = useState<'edit' | 'list'>('edit');
  useEffect(() => {
    nav.go = () => setPage('list');
  }, []);
  return (
    <main>
      {page === 'list' ? (
        <h1>İlanlarım</h1>
      ) : (
        <PostingEditor
          context={context}
          initial={initial}
          save={save as never}
          submit={submit as never}
        />
      )}
    </main>
  );
}

beforeEach(() => {
  nav.push.mockReset();
  nav.refresh.mockReset();
  nav.push.mockImplementation(() => {
    setTimeout(() => nav.go?.(), 120);
  });
});

it('"İncelemeye gönder" başarılı olup sayfa değişince odak BODY\'ye düşmez, yeni sayfanın başlığına gider', async () => {
  const save = vi.fn().mockResolvedValue({ ok: true, data: initial });
  const submit = vi.fn().mockResolvedValue({ ok: true, data: { status: 'PENDING' } });
  const { user } = renderWithToasts(<Pages save={save} submit={submit} />);
  await user.click(screen.getByRole('button', { name: 'Devam et' }));
  await user.click(screen.getByRole('button', { name: 'Devam et' }));
  // Adım başlığı odağı alana kadar bekle: gerçek kullanıcı bundan önce basmaz.
  await waitFor(() => expect(screen.getByRole('heading', { name: /Adım 3 \/ 3/ })).toHaveFocus());
  await user.click(screen.getByRole('button', { name: 'İncelemeye gönder' }));
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/ilanlarim'));
  await waitFor(() => expect(screen.getByRole('heading', { name: 'İlanlarım' })).toHaveFocus());
});
