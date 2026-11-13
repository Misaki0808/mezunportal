// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderUi } from '@/test/render';
import type { MyJobPostingPage, MyJobPostingView } from '@/contracts/job-postings';
import { MyPostings } from './manage';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const mine = {
  id: 'p1',
  status: 'PUBLISHED',
  kind: 'INTERNSHIP',
  title: 'Veri analizi stajyeri',
  organizationName: 'Örnek Kurum',
  companyId: null,
  location: 'İstanbul',
  isRemote: false,
  description: null,
  applyMethod: null,
  applyUrl: null,
  deadlineOn: '2027-02-05',
  departmentId: 'dep',
  targetDepartments: [],
  tagIds: [],
  targetGrades: [],
  moderationNote: null,
  createdAt: new Date('2026-11-08T10:00:00Z'),
  updatedAt: new Date('2026-11-08T10:00:00Z'),
  submittedAt: new Date('2026-11-08T10:00:00Z'),
  publishedAt: new Date('2026-11-09T10:00:00Z'),
  endedAt: null,
} as unknown as MyJobPostingView;
const page = (items: MyJobPostingView[]): MyJobPostingPage => ({ items, nextCursor: null });
const render = (items: MyJobPostingView[]) =>
  renderUi(<MyPostings initial={page(items)} list={vi.fn()} close={vi.fn()} />);

describe('ilanlarım: "İlan ver" eylemi', () => {
  it('boşken tek düğme: başlıktaki gizlenir, boş durumun düğmesi kalır', () => {
    render([]);
    const post = screen.getAllByRole('link', { name: 'İlan ver' });
    expect(post).toHaveLength(1);
    expect(post[0]).toHaveAttribute('href', '/ilanlar/yeni');
    // Düğme boş durum kartının içindedir (başlık satırında değil): kardeşi boş durum başlığıdır.
    expect(post[0]!.parentElement!.querySelector('h2')).toHaveTextContent(
      'Henüz bir ilan paylaşmadın.',
    );
  });

  it('doluyken "İlan ver" başlıkta kalır (bugünkü düzen)', () => {
    render([mine]);
    expect(screen.getAllByRole('link', { name: 'İlan ver' })).toHaveLength(1);
    expect(screen.queryByText('Henüz bir ilan paylaşmadın.')).not.toBeInTheDocument();
  });
});
