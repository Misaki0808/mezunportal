// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { CvReview as CvReviewData } from '@/contracts/cv';
import { renderUi } from '@/test/render';

import { CvFlow, type CvActions } from './cv-flow';
import { CvReview } from './cv-review';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});

const available = {
  available: true,
  reason: null,
  dailyLimit: 5,
  remainingToday: 4,
  linkedinPdf: false,
};
const review: CvReviewData = {
  cvUploadId: 'cv1',
  unchangedCount: 2,
  items: [
    {
      key: 'k-edu',
      section: 'EDUCATION',
      status: 'NEW',
      changedFields: [],
      standardized: {},
      current: null,
      proposed: {
        institution: 'İstanbul Üniversitesi',
        level: 'BACHELOR',
        fieldOfStudy: 'Yönetim Bilişim Sistemleri',
        startDate: '2022-09',
        endDate: null,
        isCurrent: true,
      },
    },
    {
      key: 'k-pos',
      section: 'POSITION',
      status: 'CHANGED',
      changedFields: ['title'],
      standardized: { title: 'Yazılım Geliştirici' },
      proposed: {
        company: 'Örnek A.Ş.',
        title: 'Yazılım Stajyeri',
        employmentType: 'INTERNSHIP',
        startDate: '2025-06',
        endDate: '2025-09',
        isCurrent: false,
        description: null,
      },
      current: {
        company: 'Örnek A.Ş.',
        title: 'Stajyer',
        employmentType: 'INTERNSHIP',
        startDate: '2025-06',
        endDate: '2025-09',
        isCurrent: false,
        description: null,
      },
    },
    {
      key: 'k-lang',
      section: 'LANGUAGE',
      status: 'CONFLICT',
      changedFields: ['level'],
      standardized: {},
      proposed: { name: 'İngilizce', level: 'C1' },
      current: { name: 'İngilizce', level: 'B2' },
    },
  ],
};

function setupReview(overrides: Partial<Parameters<typeof CvReview>[0]> = {}) {
  const apply = vi
    .fn()
    .mockResolvedValue({ ok: true, data: { created: 1, updated: 1, invitations: 0 } });
  const discard = vi.fn().mockResolvedValue({ ok: true, data: { discarded: true } });
  const onApplied = vi.fn();
  const onDiscarded = vi.fn();
  const view = renderUi(
    <CvReview
      review={review}
      apply={apply as never}
      discard={discard as never}
      onApplied={onApplied}
      onDiscarded={onDiscarded}
      {...overrides}
    />,
  );
  return { apply, discard, onApplied, onDiscarded, ...view };
}

describe('CV onay ekranı', () => {
  it('kalemler yeni / değişen / çakışma gruplarında, çakışma ayrı ve açıklamalı görünür', () => {
    setupReview();
    expect(screen.getByRole('heading', { name: /Yeni bilgiler/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Profilinden farklı olanlar/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Çakışmalar/ })).toBeInTheDocument();
    expect(screen.getByText(/Bunları kendin düzeltmiştin/)).toBeInTheDocument();
    expect(screen.getByText('2 kalem profilinde zaten aynı.')).toBeInTheDocument();
    // Önerilen ve mevcut değer yan yana.
    expect(screen.getByText('Yazılım Stajyeri')).toBeInTheDocument();
    expect(screen.getByText('Stajyer')).toBeInTheDocument();
  });

  it('karar verilmeyen kalem gönderilmez; hiç kabul yoksa sunucuya gitmez', async () => {
    const { user, apply } = setupReview();
    await user.click(screen.getByRole('button', { name: /Seçilenleri uygula/ }));
    expect(apply).not.toHaveBeenCalled();
    expect(screen.getByText('Uygulamak için en az bir kalemi kabul et.')).toBeInTheDocument();
  });

  it('yalnız kabul edilenler gönderilir; reddedilen ve kararsız kalem gönderilmez', async () => {
    const { user, apply, onApplied } = setupReview();
    const edu = screen.getByText('İstanbul Üniversitesi').closest('li')!;
    await user.click(within(edu).getByRole('button', { name: 'Kabul et' }));
    const pos = screen.getByText('Yazılım Stajyeri').closest('li')!;
    await user.click(within(pos).getByRole('button', { name: 'Reddet' }));
    await user.click(screen.getByRole('button', { name: /Seçilenleri uygula/ }));
    expect(apply).toHaveBeenCalledWith({
      cvUploadId: 'cv1',
      decisions: [{ key: 'k-edu', section: 'EDUCATION', overwriteMine: false }],
    });
    expect(onApplied).toHaveBeenCalledWith({ created: 1, updated: 1, invitations: 0 });
  });

  it('çakışan kalem açık “üzerine yaz” seçimi olmadan kabul edilemez; seçimle overwriteMine gider', async () => {
    const { user, apply } = setupReview();
    const lang = screen.getByRole('heading', { name: /Çakışmalar/ }).closest('section')!;
    await user.click(within(lang).getByRole('button', { name: 'Kabul et' }));
    expect(within(lang).getByRole('alert')).toHaveTextContent(
      'Üzerine yazmak için kutuyu işaretle.',
    );
    expect(within(lang).getByText('Karar bekliyor')).toBeInTheDocument();
    await user.click(
      within(lang).getByRole('checkbox', { name: /Elle yazdığım değerin üzerine yaz/ }),
    );
    await user.click(within(lang).getByRole('button', { name: 'Kabul et' }));
    await user.click(screen.getByRole('button', { name: /Seçilenleri uygula/ }));
    expect(apply.mock.calls[0]![0].decisions).toEqual([
      { key: 'k-lang', section: 'LANGUAGE', overwriteMine: true },
    ]);
  });

  it('“Yeni ve değişenlerin hepsini kabul et” çakışmayı kabul etmez', async () => {
    const { user, apply } = setupReview();
    await user.click(screen.getByRole('button', { name: /hepsini kabul et/ }));
    await user.click(screen.getByRole('button', { name: /Seçilenleri uygula/ }));
    const keys = apply.mock.calls[0]![0].decisions.map((d: { key: string }) => d.key);
    expect(keys.sort()).toEqual(['k-edu', 'k-pos']);
  });

  it('düzeltilen değer sunucuya values ile gider ve ekranda düzeltilmiş görünür', async () => {
    const { user, apply } = setupReview();
    const edu = screen.getByText('İstanbul Üniversitesi').closest('li')!;
    await user.click(within(edu).getByRole('button', { name: 'Düzelt' }));
    const dialog = await screen.findByRole('dialog');
    const field = within(dialog).getByLabelText(/Kurum/);
    await user.clear(field);
    await user.type(field, 'Marmara Üniversitesi');
    await user.click(within(dialog).getByRole('button', { name: 'Kabul et' }));
    expect(screen.getByText('Marmara Üniversitesi')).toBeInTheDocument();
    expect(screen.getByText('Düzeltilip kabul edildi')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Seçilenleri uygula/ }));
    const sent = apply.mock.calls[0]![0].decisions[0];
    expect(sent.values).toMatchObject({ institution: 'Marmara Üniversitesi' });
  });

  it('geçersiz düzeltme alan altında hata verir ve kaydedilmez', async () => {
    const { user } = setupReview();
    const edu = screen.getByText('İstanbul Üniversitesi').closest('li')!;
    await user.click(within(edu).getByRole('button', { name: 'Düzelt' }));
    const dialog = await screen.findByRole('dialog');
    await user.clear(within(dialog).getByLabelText(/Kurum/));
    await user.click(within(dialog).getByRole('button', { name: 'Kabul et' }));
    expect(within(dialog).getByText('Bu alan zorunlu.')).toBeInTheDocument();
    expect(screen.queryByText('Düzeltilip kabul edildi')).not.toBeInTheDocument();
  });

  it('sunucu CV_REVIEW_STALE dönerse metne çevirir ve yenile düğmesi gösterir', async () => {
    const { user } = setupReview({
      apply: vi.fn().mockResolvedValue({ ok: false, errorCode: 'CV_REVIEW_STALE' }) as never,
    });
    await user.click(screen.getByRole('button', { name: /hepsini kabul et/ }));
    await user.click(screen.getByRole('button', { name: /Seçilenleri uygula/ }));
    const alert = await screen.findByText(/Profilin ya da CV sonucu değişti/);
    expect(alert).not.toHaveTextContent('CV_REVIEW_STALE');
    expect(screen.getByRole('button', { name: 'Sayfayı yenile' })).toBeInTheDocument();
  });

  it('hiçbirini uygulama onaydan sonra atar', async () => {
    const { user, discard, onDiscarded } = setupReview();
    await user.click(screen.getByRole('button', { name: 'Hiçbirini uygulama' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Evet, at' }),
    );
    expect(discard).toHaveBeenCalledWith({ cvUploadId: 'cv1' });
    expect(onDiscarded).toHaveBeenCalled();
  });
});

function actions(overrides: Partial<CvActions> = {}): CvActions {
  return {
    upload: vi.fn().mockResolvedValue({ ok: true, data: { cvUploadId: 'cv1', status: 'QUEUED' } }),
    getStatus: vi.fn().mockResolvedValue({
      ok: true,
      data: { cvUploadId: 'cv1', status: 'PARSING', errorCode: null, createdAt: '' },
    }),
    getReview: vi.fn().mockResolvedValue({ ok: true, data: review }),
    apply: vi.fn(),
    discard: vi.fn(),
    ...overrides,
  };
}

describe('CV akışı', () => {
  it('sağlayıcı kapalıyken açıklama ve elle düzenleme bağlantısı gösterir, yükleme formu yoktur', () => {
    renderUi(
      <CvFlow
        availability={{ ...available, available: false, reason: 'PROVIDER_NOT_CONFIGURED' }}
        latest={null}
        actions={actions()}
      />,
    );
    expect(
      screen.getByText('CV okuma şu an kapalı. Bilgilerini elle girebilirsin.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/CV dosyası/)).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'LinkedIn profilini içe aktar' })).toBeDisabled();
    expect(screen.getByText('LinkedIn PDF içe aktarma yakında kullanıma açılacak.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Bilgilerimi elle gireceğim' })).toHaveAttribute(
      'href',
      '/profil',
    );
  });

  it('yurt dışı izni yoksa izin ekranına yönlendirir', () => {
    renderUi(
      <CvFlow
        availability={{ ...available, available: false, reason: 'TRANSFER_CONSENT_REQUIRED' }}
        latest={null}
        actions={actions()}
      />,
    );
    expect(screen.getByRole('link', { name: 'İzin ekranına git' })).toHaveAttribute(
      'href',
      '/onay',
    );
  });

  it('PDF olmayan ve büyük dosyayı sunucuya göndermeden alan hatasıyla reddeder', async () => {
    const upload = vi.fn();
    const { user } = renderUi(
      <CvFlow availability={available} latest={null} actions={actions({ upload })} />,
    );
    const input = screen.getByLabelText(/CV dosyası/);
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'cv.txt', { type: 'text/plain' })] },
    });
    await user.click(screen.getByRole('button', { name: "CV'yi oku" }));
    expect(await screen.findByText('Yalnız PDF dosyası yükleyebilirsin.')).toBeInTheDocument();
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'cv.pdf', {
      type: 'application/pdf',
    });
    fireEvent.change(input, { target: { files: [big] } });
    await user.click(screen.getByRole('button', { name: "CV'yi oku" }));
    expect(await screen.findByText('Dosya en fazla 5 MB olabilir.')).toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();
  });

  it('dosya seçici Türkçe: seçilmeden "PDF seç", seçilince dosya adı; hata dosya alanına bağlı', async () => {
    const upload = vi.fn();
    const { user } = renderUi(
      <CvFlow availability={available} latest={null} actions={actions({ upload })} />,
    );
    const input = screen.getByLabelText(/CV dosyası/);
    expect(screen.getByText('PDF seç')).toBeInTheDocument();
    expect(screen.getByText('Henüz dosya seçilmedi')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: "CV'yi oku" }));
    const error = await screen.findByText('Bir PDF dosyası seç.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toContain(error.closest('p')!.id);

    await user.upload(input, new File(['%PDF-1.4'], 'cv-efe.pdf', { type: 'application/pdf' }));
    expect(screen.getByText('cv-efe.pdf')).toBeInTheDocument();
    expect(screen.getByText('Dosyayı değiştir')).toBeInTheDocument();
  });

  it('dosya seçilince "Bir PDF dosyası seç." hatası hemen kalkar ve alan geçersiz işaretli kalmaz', async () => {
    const { user } = renderUi(
      <CvFlow availability={available} latest={null} actions={actions({})} />,
    );
    const input = screen.getByLabelText(/CV dosyası/);
    await user.click(screen.getByRole('button', { name: "CV'yi oku" }));
    expect(await screen.findByText('Bir PDF dosyası seç.')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');

    await user.upload(input, new File(['%PDF-1.4'], 'cv.pdf', { type: 'application/pdf' }));

    expect(screen.queryByText('Bir PDF dosyası seç.')).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('"CV\'yi oku" çubuğu dosya seçilmeden yapışkan değildir (seçicinin yarısını örtmesin), seçilince yapışır, dosya kalkarsa akışa döner', async () => {
    const { user } = renderUi(
      <CvFlow availability={available} latest={null} actions={actions({})} />,
    );
    const input = screen.getByLabelText(/CV dosyası/);
    const bar = screen.getByRole('button', { name: "CV'yi oku" }).parentElement!;
    // 390×664'te yapışkan çubuk seçicinin %44'ünü, 375'te %38'ini, 320'de %60'ını örtüyordu.
    expect(bar).not.toHaveClass('sticky-actions');

    await user.upload(input, new File(['%PDF-1.4'], 'cv.pdf', { type: 'application/pdf' }));
    expect(bar).toHaveClass('sticky-actions');

    fireEvent.change(input, { target: { files: [] } });
    expect(bar).not.toHaveClass('sticky-actions');
  });

  it('geçerli PDF yüklenir → işleniyor → sonuç hazır olunca onay ekranı açılır', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const statuses = [
        {
          ok: true,
          data: { cvUploadId: 'cv1', status: 'PARSING', errorCode: null, createdAt: '' },
        },
        { ok: true, data: { cvUploadId: 'cv1', status: 'PARSED', errorCode: null, createdAt: '' } },
      ];
      const getStatus = vi.fn().mockImplementation(async () => statuses.shift() ?? statuses[0]);
      const { user } = renderUi(
        <CvFlow
          availability={available}
          latest={null}
          actions={actions({ getStatus })}
          pollMs={500}
        />,
      );
      await user.upload(
        screen.getByLabelText(/CV dosyası/),
        new File(['%PDF-1.4'], 'cv.pdf', { type: 'application/pdf' }),
      );
      await user.click(screen.getByRole('button', { name: "CV'yi oku" }));
      expect(await screen.findByRole('heading', { name: "CV'n okunuyor" })).toBeInTheDocument();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600);
      });
      expect(
        await screen.findByRole('heading', { name: 'Bulunan bilgileri gözden geçir' }),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('CV hatasında elle düzenlemeye yönlendirir ve ham kodu göstermez', () => {
    renderUi(
      <CvFlow
        availability={available}
        latest={{ cvUploadId: 'cv1', status: 'FAILED', errorCode: 'CV_PARSE_EMPTY', createdAt: '' }}
        actions={actions()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent("CV'nden bilgi çıkaramadık");
    expect(screen.getByRole('alert')).not.toHaveTextContent('CV_PARSE_EMPTY');
    expect(screen.getByRole('link', { name: 'Bilgilerimi elle gir' })).toHaveAttribute(
      'href',
      '/profil',
    );
  });

  it('LinkedIn PDF yönergesi alt sayfada açılır', async () => {
    const { user } = renderUi(
      <CvFlow availability={available} latest={null} actions={actions()} />,
    );
    await user.click(screen.getByRole('button', { name: "LinkedIn PDF'i nasıl alınır?" }));
    expect(
      await screen.findByRole('dialog', { name: 'LinkedIn profilini PDF olarak al' }),
    ).toBeInTheDocument();
  });

  it('sunucu yükleme hatası (rıza/günlük sınır) metne çevrilir', async () => {
    const upload = vi.fn().mockResolvedValue({ ok: false, errorCode: 'CV_DAILY_LIMIT_REACHED' });
    const { user } = renderUi(
      <CvFlow availability={available} latest={null} actions={actions({ upload })} />,
    );
    await user.upload(
      screen.getByLabelText(/CV dosyası/),
      new File(['%PDF-1.4'], 'cv.pdf', { type: 'application/pdf' }),
    );
    await user.click(screen.getByRole('button', { name: "CV'yi oku" }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Bugünlük CV okuma hakkın doldu');
  });
});

it('inceleyici: üzerine yaz seçimi geri alınınca önceden kabul edilmiş çakışma gönderilmez', async () => {
  const { user, apply } = setupReview();
  const lang = screen.getByRole('heading', { name: /Çakışmalar/ }).closest('section')!;
  const box = within(lang).getByRole('checkbox', { name: /Elle yazdığım değerin üzerine yaz/ });
  await user.click(box);
  await user.click(within(lang).getByRole('button', { name: 'Kabul et' }));
  await user.click(box);
  await user.click(
    within(screen.getByText('İstanbul Üniversitesi').closest('li')!).getByRole('button', {
      name: 'Kabul et',
    }),
  );
  await user.click(screen.getByRole('button', { name: /Seçilenleri uygula/ }));
  expect(apply.mock.calls[0]![0].decisions).toEqual([
    { key: 'k-edu', section: 'EDUCATION', overwriteMine: false },
  ]);
});
it('inceleyici: CV temel bilgi özetini düzeltme mevcut özeti açar ve düzenlenen özeti gönderir', async () => {
  const { user, apply } = setupReview({
    review: {
      ...review,
      items: [
        {
          key: 'k-profile',
          section: 'PROFILE',
          status: 'NEW',
          changedFields: [],
          standardized: {},
          current: null,
          proposed: { headline: 'Başlık', summary: 'Eski özet', city: 'İstanbul' },
        },
      ],
    },
  });
  await user.click(screen.getByRole('button', { name: 'Düzelt' }));
  const dialog = await screen.findByRole('dialog');
  const summary = within(dialog).getByLabelText('Özet');
  expect(summary).toHaveValue('Eski özet');
  await user.clear(summary);
  await user.type(summary, 'Düzeltilen özet');
  await user.click(within(dialog).getByRole('button', { name: 'Kabul et' }));
  await user.click(screen.getByRole('button', { name: /Seçilenleri uygula/ }));
  expect(apply.mock.calls[0]![0].decisions[0].values.summary).toBe('Düzeltilen özet');
});

it('LinkedIn seçimi yüklemede kaynak olarak gönderilir', async () => {
  const upload = vi
    .fn()
    .mockResolvedValue({ ok: true, data: { cvUploadId: 'cv-linkedin', status: 'QUEUED' } });
  const { user } = renderUi(
    <CvFlow
      availability={{ ...available, linkedinPdf: true }}
      latest={null}
      actions={actions({ upload })}
    />,
  );
  await user.click(screen.getByRole('radio', { name: 'LinkedIn profilini içe aktar' }));
  await user.upload(
    screen.getByLabelText(/CV dosyası/),
    new File(['%PDF-1.4'], 'profil.pdf', { type: 'application/pdf' }),
  );
  await user.click(screen.getByRole('button', { name: "CV'yi oku" }));
  expect(upload).toHaveBeenCalledOnce();
  expect((upload.mock.calls[0]![0] as FormData).get('source')).toBe('LINKEDIN_PDF');
});

it('gerçek çıkarıcı ve maskeleme yokken LinkedIn seçimi kapalı ve sebebi görünür', () => {
  renderUi(<CvFlow availability={available} latest={null} actions={actions()} />);
  expect(screen.getByRole('radio', { name: 'LinkedIn profilini içe aktar' })).toBeDisabled();
  expect(screen.getByText('LinkedIn PDF içe aktarma yakında kullanıma açılacak.')).toBeVisible();
});
