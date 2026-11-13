// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react';
import Link from 'next/link';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type {
  MyProfile as MyProfileData,
  ProfileView as ProfileViewData,
} from '@/contracts/profile-content';
import messages from '../../../messages/tr.json';
import { renderWithToasts } from '@/test/render';

import { MyProfile, type MyProfileActions } from './my-profile';
import { ProfileView } from './profile-view';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});

const base: MyProfileData = {
  userId: 'u1',
  displayName: 'Deniz Aksoy',
  headline: null,
  summary: null,
  city: null,
  goals: null,
  education: [],
  positions: [],
  languages: [],
  certifications: [],
  skills: [],
  socialLinks: [],
  linkedinUrl: null,
  cvUpdatedAt: null,
  lastUpdatedAt: null,
  completion: { percent: 20, missing: ['BASICS', 'EDUCATION', 'SKILLS', 'CV'] },
};
const ok = (data: MyProfileData) => vi.fn().mockResolvedValue({ ok: true, data });

function actions(overrides: Partial<MyProfileActions> = {}): MyProfileActions {
  return {
    updateBasics: ok(base),
    setSocialLinks: ok(base),
    setLinkedinUrl: ok(base),
    saveEntry: ok(base),
    deleteEntry: ok(base),
    addSkill: ok(base),
    removeSkill: ok(base),
    suggestSkills: vi.fn().mockResolvedValue({ ok: true, data: { skills: [] } }),
    ...overrides,
  };
}

describe('kendi profilim', () => {
  it('beceri kaydı hatası bölüm kapatılsa da görünür; alan içeriği tekrar açılınca korunur', async () => {
    const addSkill = vi.fn().mockResolvedValue({ ok: false, errorCode: 'RATE_LIMITED' });
    const { user } = renderWithToasts(<MyProfile initial={base} actions={actions({ addSkill })} />);
    const toggle = screen.getByRole('button', { name: 'Beceriler' });
    await user.click(toggle);
    await user.type(screen.getByLabelText('Beceri ekle'), 'SQL');
    await user.click(
      within(document.getElementById('profile-skills')!).getByRole('button', { name: 'Ekle' }),
    );
    expect(await screen.findByText(messages.errors.codes.RATE_LIMITED)).toBeVisible();
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText(messages.errors.codes.RATE_LIMITED)).toBeVisible();
    await user.click(toggle);
    expect(screen.getByLabelText('Beceri ekle')).toHaveValue('SQL');
  });
  it('profil kaydetme çift gönderimi engeller, hata alanı korur', async () => {
    const gate = Promise.withResolvers<never>();
    const updateBasics = vi.fn(() => gate.promise);
    const { user } = renderWithToasts(
      <MyProfile initial={base} actions={actions({ updateBasics })} />,
    );
    await user.click(screen.getAllByRole('button', { name: 'Profilimi düzenle' })[0]!);
    const headline = screen.getByLabelText('Başlık');
    await user.type(headline, 'Korunan başlık');
    const button = screen.getByRole('button', { name: 'Kaydet' });
    const form = document.getElementById(button.getAttribute('form')!)!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(updateBasics).toHaveBeenCalledTimes(1);
    expect(button).toHaveAttribute('aria-busy', 'true');
    await act(async () => gate.reject(new Error('ağ')));
    expect(headline).toHaveValue('Korunan başlık');
    expect(
      within(screen.getByRole('dialog')).getByText(messages.errors.codes.SERVER_UNEXPECTED),
    ).toBeVisible();
  });
  it('temel bilgiler: başarıda "Profilin güncellendi" bildirimi, çekmece kapanır', async () => {
    const updateBasics = ok({ ...base, headline: 'Veri analisti adayı' });
    const { user } = renderWithToasts(
      <MyProfile initial={base} actions={actions({ updateBasics })} />,
    );
    await user.click(screen.getAllByRole('button', { name: 'Profilimi düzenle' })[0]!);
    await user.type(screen.getByLabelText('Başlık'), 'Veri analisti adayı');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect(await screen.findByText('Profilin güncellendi.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('temel bilgiler hatası: çekmece açık kalır, yazılan metin korunur, hata YALNIZ çekmecede (bir kez) gösterilir', async () => {
    const updateBasics = vi.fn().mockRejectedValue(new Error('ağ'));
    const { user } = renderWithToasts(
      <MyProfile initial={base} actions={actions({ updateBasics })} />,
    );
    await user.click(screen.getAllByRole('button', { name: 'Profilimi düzenle' })[0]!);
    const headline = screen.getByLabelText('Başlık');
    await user.type(headline, 'Yarım kalan başlık');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));
    const message = messages.errors.codes.SERVER_UNEXPECTED;
    expect(await screen.findAllByText(message)).toHaveLength(1);
    expect(within(screen.getByRole('dialog')).getByText(message)).toBeInTheDocument();
    expect(headline).toHaveValue('Yarım kalan başlık');
    expect(screen.queryByText('Profilin güncellendi.')).toBeNull();
  });

  it('tamamlama yüzdesi ve eksikler insan diliyle; CV bağlantısı var', () => {
    renderWithToasts(<MyProfile initial={base} actions={actions()} />);
    expect(screen.getByText('Profilin %20 tamamlandı')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '20');
    expect(screen.getByText('Başlık ve şehir ekle')).toBeInTheDocument();
    expect(screen.getByText('En az 3 beceri ekle')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'CV yükle' })).toHaveAttribute('href', '/profil/cv');
    expect(screen.getByText('Henüz güncellenmedi')).toBeInTheDocument();
  });

  it('ilk ekranda tek "sıradaki adım" önerilir; diğer eksikler kapalı bir listede durur', async () => {
    const { user } = renderWithToasts(<MyProfile initial={base} actions={actions()} />);
    // Eksikler: BASICS, EDUCATION, SKILLS, CV → öneri sırası BASICS'i öne alır; CV zaten ayrı kartta.
    const next = screen.getByRole('button', { name: 'Başlık ve şehir ekle' });
    expect(screen.getByText('Sıradaki adım')).toBeInTheDocument();
    const others = screen.getByRole('button', { name: 'Diğer eksikler (3)' });
    expect(others).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('En az 3 beceri ekle')).not.toBeVisible();
    await user.click(others);
    expect(others).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('En az 3 beceri ekle')).toBeVisible();
    await user.click(next);
    expect(within(await screen.findByRole('dialog')).getByLabelText('Başlık')).toBeInTheDocument();
  });

  it('doğrulama eksikse sıradaki adım sayfa bağlantısıdır', () => {
    const unverified: MyProfileData = {
      ...base,
      completion: { percent: 0, missing: ['MEMBERSHIP', 'BASICS'] },
    };
    renderWithToasts(<MyProfile initial={unverified} actions={actions()} />);
    expect(screen.getByRole('link', { name: 'Üyeliğini doğrula' })).toHaveAttribute(
      'href',
      '/dogrulama',
    );
  });

  it('bilgi bölümleri varsayılan kapalıdır, özetini söyler; başlığa basınca açılır', async () => {
    const { user } = renderWithToasts(<MyProfile initial={base} actions={actions()} />);
    const toggle = screen.getByRole('button', { name: 'Eğitim' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAccessibleDescription('Henüz eklenmedi');
    const panel = document.getElementById(toggle.getAttribute('aria-controls')!)!;
    expect(panel).not.toBeVisible();
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(panel).toBeVisible();
    await user.click(toggle);
    expect(panel).not.toBeVisible();
  });

  it('eğitim ekle: alt sayfada doldurulur, sözleşme biçiminde gider, yanıttaki profil çizilir', async () => {
    const withEdu: MyProfileData = {
      ...base,
      education: [
        {
          id: 'e1',
          source: 'MANUAL',
          manuallyEdited: false,
          institution: 'İstanbul Üniversitesi',
          level: 'BACHELOR',
          fieldOfStudy: null,
          startDate: '2022-09',
          endDate: null,
          isCurrent: true,
        },
      ],
    };
    const saveEntry = ok(withEdu);
    const { user } = renderWithToasts(
      <MyProfile initial={base} actions={actions({ saveEntry })} />,
    );
    const block = screen.getByRole('heading', { name: 'Eğitim' }).closest('section')!;
    await user.click(within(block).getByRole('button', { name: 'Ekle' }));
    const sheet = await screen.findByRole('dialog');
    await user.type(within(sheet).getByLabelText(/Kurum/), 'İstanbul Üniversitesi');
    await user.click(within(sheet).getByRole('button', { name: 'Kaydet' }));
    expect(saveEntry).toHaveBeenCalledWith({
      section: 'EDUCATION',
      values: expect.objectContaining({ institution: 'İstanbul Üniversitesi', isCurrent: false }),
    });
    expect(await screen.findByText('İstanbul Üniversitesi', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('Elle')).toBeInTheDocument();
    // Kayıttan sonra bölüm açılır: eklenen kalem görünür olur (kapalı bırakılsaydı kullanıcı sonucu görmezdi).
    expect(within(block).getByRole('button', { name: 'Eğitim' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('boş zorunlu alan alt sayfada alan hatası verir, sunucuya gitmez', async () => {
    const saveEntry = ok(base);
    const { user } = renderWithToasts(
      <MyProfile initial={base} actions={actions({ saveEntry })} />,
    );
    const block = screen.getByRole('heading', { name: 'Eğitim' }).closest('section')!;
    await user.click(within(block).getByRole('button', { name: 'Ekle' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Kaydet' }),
    );
    expect(saveEntry).not.toHaveBeenCalled();
    expect(screen.getByText('Bu alan zorunlu.')).toBeInTheDocument();
  });

  it('kalem silme onay penceresinden sonra gider; kaynak ve düzeltme rozetleri görünür', async () => {
    const withPos: MyProfileData = {
      ...base,
      positions: [
        {
          id: 'p1',
          source: 'CV',
          manuallyEdited: true,
          company: 'Örnek A.Ş.',
          title: 'Stajyer',
          employmentType: 'INTERNSHIP',
          startDate: '2025-06',
          endDate: '2025-09',
          isCurrent: false,
          description: null,
        },
      ],
    };
    const deleteEntry = ok(base);
    const { user } = renderWithToasts(
      <MyProfile initial={withPos} actions={actions({ deleteEntry })} />,
    );
    expect(screen.getByText("CV'den")).toBeInTheDocument();
    expect(screen.getByText('Düzeltildi')).toBeInTheDocument();
    const block = screen.getByRole('heading', { name: 'Pozisyon' }).closest('section')!;
    await user.click(within(block).getByRole('button', { name: 'Pozisyon' }));
    await user.click(within(block).getByRole('button', { name: 'Sil' }));
    expect(deleteEntry).not.toHaveBeenCalled();
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Evet, sil' }),
    );
    expect(deleteEntry).toHaveBeenCalledWith({ section: 'POSITION', id: 'p1' });
  });

  it('bağlantılar: http ve izinsiz alan adı ekranda anlaşılır reddedilir, geçerli adres kanonik gider', async () => {
    const setLinkedinUrl = ok(base);
    const setSocialLinks = ok(base);
    const { user } = renderWithToasts(
      <MyProfile initial={base} actions={actions({ setLinkedinUrl, setSocialLinks })} />,
    );
    const block = screen.getByRole('heading', { name: 'Bağlantılar' }).closest('section')!;
    await user.click(within(block).getByRole('button', { name: 'Düzenle' }));
    const sheet = await screen.findByRole('dialog');
    await user.click(within(sheet).getByRole('button', { name: 'Bağlantı ekle' }));
    await user.selectOptions(within(sheet).getByLabelText('Site'), 'GITHUB');
    await user.type(within(sheet).getByLabelText('Adres'), 'http://github.com/deniz');
    await user.click(within(sheet).getByRole('button', { name: 'Kaydet' }));
    expect(within(sheet).getByText('Adres https ile başlamalı.')).toBeInTheDocument();
    await user.clear(within(sheet).getByLabelText('Adres'));
    await user.type(within(sheet).getByLabelText('Adres'), 'https://kotu.example/deniz');
    await user.click(within(sheet).getByRole('button', { name: 'Kaydet' }));
    expect(within(sheet).getByText(/Bu siteye bağlantı eklenemiyor/)).toBeInTheDocument();
    expect(setSocialLinks).not.toHaveBeenCalled();
    await user.clear(within(sheet).getByLabelText('Adres'));
    await user.type(within(sheet).getByLabelText('Adres'), 'https://www.github.com/deniz/?x=1');
    await user.type(
      within(sheet).getByLabelText(/LinkedIn adresi/),
      'https://tr.linkedin.com/in/deniz-aksoy',
    );
    await user.click(within(sheet).getByRole('button', { name: 'Kaydet' }));
    expect(setLinkedinUrl).toHaveBeenCalledWith({ url: 'https://www.linkedin.com/in/deniz-aksoy' });
    expect(setSocialLinks).toHaveBeenCalledWith({
      links: [{ kind: 'GITHUB', url: 'https://github.com/deniz' }],
    });
  });

  it('beceri: önerilen ad eklenir; sunucu sınır hatası katalog metniyle gösterilir', async () => {
    const addSkill = vi.fn().mockResolvedValue({ ok: false, errorCode: 'PROFILE_LIMIT_REACHED' });
    const suggestSkills = vi
      .fn()
      .mockResolvedValue({ ok: true, data: { skills: [{ label: 'TypeScript' }] } });
    const { user } = renderWithToasts(
      <MyProfile initial={base} actions={actions({ addSkill, suggestSkills })} />,
    );
    await user.click(screen.getByRole('button', { name: 'Beceriler' }));
    await user.type(screen.getByLabelText('Beceri ekle'), 'typ');
    await user.click(await screen.findByRole('button', { name: 'TypeScript' }));
    expect(addSkill).toHaveBeenCalledWith({ name: 'TypeScript' });
    expect(await screen.findByText(/üst sınıra ulaştın/)).toBeVisible();
  });

  it('beceri kaldırma kimliğiyle gider', async () => {
    const removeSkill = ok(base);
    const withSkill = { ...base, skills: [{ tagId: 't1', label: 'SQL' }] };
    const { user } = renderWithToasts(
      <MyProfile initial={withSkill} actions={actions({ removeSkill })} />,
    );
    await user.click(screen.getByRole('button', { name: 'Beceriler' }));
    await user.click(screen.getByRole('button', { name: 'SQL becerisini kaldır' }));
    expect(removeSkill).toHaveBeenCalledWith({ tagId: 't1' });
  });
});

const view: ProfileViewData = {
  userId: 'u2',
  displayName: 'Mert Yıldız',
  memberships: [{ departmentName: 'Yönetim Bilişim Sistemleri', role: 'ALUMNI' }],
  education: [],
  positions: [],
  languages: [],
  certifications: [],
  skills: [{ label: 'SQL' }],
  lastUpdatedAt: null,
};

const position = (over: Partial<ProfileViewData['positions'][number]> = {}) => ({
  title: 'Stajyer',
  company: 'Örnek A.Ş.',
  employmentType: null,
  startDate: null,
  endDate: null,
  isCurrent: false,
  description: null,
  ...over,
});

describe('başkasının profili', () => {
  it('yalnız gelen alanlar çizilir; gizli alan için hiçbir gösterge yoktur', () => {
    renderWithToasts(<ProfileView profile={view} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Mert Yıldız' })).toBeInTheDocument();
    expect(screen.getByText('Mezun · Yönetim Bilişim Sistemleri')).toBeInTheDocument();
    expect(screen.getByText('SQL')).toBeInTheDocument();
    for (const word of [/gizli/i, /paylaşmıyor/i, /E-posta/, /Telefon/, /LinkedIn/, /Hakkında/]) {
      expect(screen.queryByText(word)).not.toBeInTheDocument();
    }
  });

  it('başlık: baş harf avatarı, ad, güncel konum; serbest başlık altta soluk', () => {
    renderWithToasts(
      <ProfileView
        profile={{
          ...view,
          headline: 'Ürün yöneticisi',
          positions: [
            position({ title: 'Eski rol', company: 'Eski A.Ş.' }),
            position({ title: 'Ürün Yöneticisi', company: 'Örnek A.Ş.', isCurrent: true }),
          ],
        }}
      />,
    );
    const header = screen
      .getByRole('heading', { level: 1, name: 'Mert Yıldız' })
      .closest('header')!;
    // Avatar dekoratif: ad zaten yanında yazıyor.
    expect(header.querySelector('span[aria-hidden="true"]')).toHaveTextContent('MY');
    const current = within(header).getByText('Ürün Yöneticisi · Örnek A.Ş.');
    expect(within(header).queryByText(/Eski rol/)).toBeNull();
    expect(current).toHaveClass('text-fg');
    expect(within(header).getByText('Ürün yöneticisi')).toHaveClass('text-fg-muted');
  });

  it('güncel konum işaretli değilse en üstteki kayıt öne çıkar; konum yoksa serbest başlık öne çıkar', () => {
    const { unmount } = renderWithToasts(
      <ProfileView profile={{ ...view, positions: [position()] }} />,
    );
    expect(screen.getByText('Stajyer · Örnek A.Ş.')).toBeVisible();
    unmount();
    renderWithToasts(<ProfileView profile={{ ...view, headline: 'Veri meraklısı' }} />);
    expect(screen.getByText('Veri meraklısı')).toHaveClass('text-fg');
  });

  it('eylemler ve rozetler başlıkta yer alır: eylem içerikten ÖNCE gelir', () => {
    renderWithToasts(
      <ProfileView
        profile={{ ...view, summary: 'Kısa özet metni.' }}
        badges={<span>Referans verdi: 2</span>}
        actions={<Link href="/randevu-al/u2">Randevu iste</Link>}
      />,
    );
    const header = screen.getByRole('heading', { level: 1 }).closest('header')!;
    expect(within(header).getByText('Referans verdi: 2')).toBeVisible();
    const action = within(header).getByRole('link', { name: 'Randevu iste' });
    const summary = screen.getByText('Kısa özet metni.');
    expect(action.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('açık iletişim alanı gelirse gösterilir; bağlantılar güvenli açılır', () => {
    renderWithToasts(
      <ProfileView
        profile={{
          ...view,
          email: 'mert@example.com',
          linkedinUrl: 'https://www.linkedin.com/in/mert-yildiz',
        }}
      />,
    );
    expect(screen.getByRole('link', { name: 'mert@example.com' })).toHaveAttribute(
      'href',
      'mailto:mert@example.com',
    );
    const link = screen.getByRole('link', { name: 'https://www.linkedin.com/in/mert-yildiz' });
    expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('hiçbir alan yoksa genel boş durum gösterilir', () => {
    renderWithToasts(<ProfileView profile={{ ...view, skills: [], memberships: [] }} />);
    expect(screen.getByText('Gösterilecek bilgi yok')).toBeInTheDocument();
  });
});
