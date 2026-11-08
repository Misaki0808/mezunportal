// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { renderUi } from '@/test/render';
import type { JobPostingCard, JobPostingFormContext } from '@/contracts/job-postings';
import { PostingList } from './list';
import { PostingDetail } from './detail';
import { PostingEditor } from './editor';
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
const posting: JobPostingCard = {
  id: 'job-1',
  kind: 'INTERNSHIP',
  title: 'Yazılım stajyeri',
  organizationName: 'Örnek Kurum',
  companyId: null,
  location: 'İstanbul',
  isRemote: false,
  deadlineOn: '2027-02-05',
  daysLeft: 2,
  applyMethod: 'URL',
  publishedAt: new Date(),
  authorKind: 'ALUMNI',
  targetDepartments: [{ id: 'dep', name: 'YBS' }],
};
const options = {
  organizations: [{ key: 'Örnek Kurum', companyId: null, name: 'Örnek Kurum', count: 1 }],
  departments: [{ id: 'dep', name: 'YBS', count: 1 }],
  locations: [{ name: 'İstanbul', count: 1 }],
  remoteCount: 0,
};
const context: JobPostingFormContext = {
  authorDepartments: [{ id: 'dep', name: 'YBS' }],
  targetDepartments: [{ id: 'dep', name: 'YBS', facultyName: 'İşletme' }],
  limits: { maxDays: 60, submitLimit: 5, submitWindowDays: 30, maxTargets: 10 },
};
it('öğrenciye ilan verme sunulmaz; süzgeçler ve sonraki sayfa URL taşır', () => {
  renderUi(
    <PostingList
      canPost={false}
      filters={{ q: 'staj', location: 'İstanbul', organizationName: 'Örnek Kurum' }}
      options={options}
      page={{ items: [posting], total: 25, page: 1, pageSize: 20 }}
    />,
  );
  expect(screen.queryByRole('link', { name: 'İlan ver' })).not.toBeInTheDocument();
  expect(screen.getByText(/doğrulanmış mezunlar/)).toBeVisible();
  expect(screen.getByRole('option', { name: 'Örnek Kurum' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Sonraki/ }).getAttribute('href')).toContain(
    'organizationName=',
  );
});
it('detayda yalnız güvenli dış bağlantı ve yazarın kimliği yoktur', () => {
  renderUi(
    <PostingDetail
      posting={{
        ...posting,
        description: 'Açıklama',
        applyUrl: 'https://example.org/basvur',
      }}
    />,
  );
  expect(screen.getByRole('link', { name: /Başvur/ })).toHaveAttribute(
    'rel',
    'noopener noreferrer',
  );
  expect(screen.queryByRole('link', { name: 'İletişim iste' })).not.toBeInTheDocument();
});
it('eksik form hatası özetlenir ve odaklanır, işlem çağrılmaz', async () => {
  const save = vi.fn(),
    submit = vi.fn();
  renderUi(<PostingEditor context={context} save={save} submit={submit} />);
  fireEvent.click(screen.getByRole('button', { name: 'Devam et' }));
  fireEvent.click(screen.getByRole('button', { name: 'Devam et' }));
  fireEvent.click(screen.getByRole('button', { name: 'İncelemeye gönder' }));
  const alert = await screen.findByText('Lütfen işaretli alanları kontrol et.');
  await waitFor(() => expect(alert).toHaveFocus());
  expect(save).not.toHaveBeenCalled();
});
it('iletişim eylemi yazar kimliği taşımadan ilan üzerinden açılır', () => {
  renderUi(
    <PostingDetail
      canRequestContact
      posting={{
        ...posting,
        applyMethod: 'CONTACT_REQUEST',
        description: 'Açıklama',
        applyUrl: null,
      }}
    />,
  );
  const link = screen.getByRole('link', { name: 'İletişim iste' });
  expect(link).toHaveAttribute('href', '/ilanlar/job-1/iletisim');
  expect(document.body.innerHTML).not.toContain('gizli-yazar');
});
it('talep edilemeyen ilan için düğme yerine tek nötr açıklama gösterilir', () => {
  renderUi(
    <PostingDetail
      posting={{
        ...posting,
        applyMethod: 'CONTACT_REQUEST',
        description: 'Açıklama',
        applyUrl: null,
      }}
    />,
  );
  expect(screen.queryByRole('link', { name: 'İletişim iste' })).not.toBeInTheDocument();
  expect(screen.getByText('Bu ilan için şu anda iletişim talebi oluşturulamıyor.')).toBeVisible();
});
it('ilan iletişimi yalnız ilan kimliği ve seçilen alanlarla gönderilir', async () => {
  const { PostingContactForm } = await import('./contact');
  const send = vi
    .fn()
    .mockResolvedValue({ ok: true, data: { requestId: 'istek', status: 'PENDING' } });
  renderUi(<PostingContactForm postingId="ilan-123" requestableFields={['EMAIL']} send={send} />);
  fireEvent.click(screen.getByRole('checkbox', { name: 'E-posta' }));
  fireEvent.click(screen.getByRole('button', { name: 'Talep gönder' }));
  await waitFor(() =>
    expect(send).toHaveBeenCalledWith({ jobPostingId: 'ilan-123', fields: ['EMAIL'], message: '' }),
  );
  expect(await screen.findByRole('status')).toHaveTextContent('Talebin gönderildi');
});
