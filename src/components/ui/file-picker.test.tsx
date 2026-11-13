// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/test/render';

import { Field } from './field';
import { FilePicker } from './file-picker';

const pdf = () => new File(['içerik'], 'mezuniyet-belgesi.pdf', { type: 'application/pdf' });

describe('FilePicker', () => {
  it('etiketle bulunan GERÇEK dosya girdisidir; dosya yokken "Henüz dosya seçilmedi" ve bağlama göre düğme yazısı görünür', () => {
    renderUi(
      <Field label="Mezun belgesi">
        {(control) => <FilePicker {...control} name="file" chooseLabel="PDF seç" />}
      </Field>,
    );

    const input = screen.getByLabelText('Mezun belgesi');
    expect(input).toHaveAttribute('type', 'file');
    expect(input).toHaveAttribute('name', 'file');
    expect(screen.getByText('PDF seç')).toBeInTheDocument();
    expect(screen.getByText('Henüz dosya seçilmedi')).toBeInTheDocument();
    // Tarayıcının İngilizce yerli metni yok: düğme yazısı bizim, girdi görünmez örtü.
    expect(input).toHaveAccessibleDescription('Henüz dosya seçilmedi');
  });

  it('düğme yazısı verilmezse genel "Dosya seç" kullanılır', () => {
    renderUi(<Field label="Dosya">{(control) => <FilePicker {...control} />}</Field>);

    expect(screen.getByText('Dosya seç')).toBeInTheDocument();
  });

  it('dosya seçilince adı görünür, düğme "Dosyayı değiştir" olur ve ad ekran okuyucuya açıklama olarak verilir', async () => {
    const onChange = vi.fn();
    const { user } = renderUi(
      <Field label="Mezun belgesi">
        {(control) => <FilePicker {...control} chooseLabel="PDF seç" onChange={onChange} />}
      </Field>,
    );

    const input = screen.getByLabelText('Mezun belgesi');
    await user.upload(input, pdf());

    expect(screen.getByText('mezuniyet-belgesi.pdf')).toBeInTheDocument();
    expect(screen.getByText('Dosyayı değiştir')).toBeInTheDocument();
    expect(screen.queryByText('PDF seç')).not.toBeInTheDocument();
    expect(screen.queryByText('Henüz dosya seçilmedi')).not.toBeInTheDocument();
    expect(input).toHaveAccessibleDescription('mezuniyet-belgesi.pdf');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('seçilen dosya form verisine girer (yerli girdi korunur)', async () => {
    const { user, container } = renderUi(
      <form>
        <Field label="CV">{(control) => <FilePicker {...control} name="file" />}</Field>
      </form>,
    );

    await user.upload(screen.getByLabelText('CV'), pdf());

    const data = new FormData(container.querySelector('form')!);
    expect((data.get('file') as File).name).toBe('mezuniyet-belgesi.pdf');
  });

  it('klavyeyle odaklanabilir (Tab girdiye gelir; display:none/hidden değil)', async () => {
    const { user } = renderUi(
      <Field label="Mezun belgesi">{(control) => <FilePicker {...control} />}</Field>,
    );

    await user.tab();

    expect(screen.getByLabelText('Mezun belgesi')).toHaveFocus();
  });

  it('ipucu ve hata girdiye aria-describedby ile bağlanır, aria-invalid verilir; dosya adı da açıklamada kalır', async () => {
    const { user } = renderUi(
      <Field label="CV" hint="Yalnız PDF" error="Dosya seçmedin.">
        {(control) => <FilePicker {...control} />}
      </Field>,
    );

    const input = screen.getByLabelText('CV');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Henüz dosya seçilmedi Yalnız PDF Dosya seçmedin.');

    await user.upload(input, pdf());
    expect(input).toHaveAccessibleDescription('mezuniyet-belgesi.pdf Yalnız PDF Dosya seçmedin.');
  });

  it('hata yokken aria-invalid yoktur', () => {
    renderUi(<Field label="CV">{(control) => <FilePicker {...control} />}</Field>);

    expect(screen.getByLabelText('CV')).not.toHaveAttribute('aria-invalid');
  });

  it('üst bileşen `fileName` verirse onu gösterir (reddedilen dosyanın adı gösterilmez)', async () => {
    const { user } = renderUi(
      <Field label="Liste">{(control) => <FilePicker {...control} fileName="" />}</Field>,
    );

    await user.upload(screen.getByLabelText('Liste'), pdf());

    expect(screen.queryByText('mezuniyet-belgesi.pdf')).not.toBeInTheDocument();
    expect(screen.getByText('Henüz dosya seçilmedi')).toBeInTheDocument();
  });

  it('devre dışıyken seçilemez', () => {
    renderUi(<Field label="CV">{(control) => <FilePicker {...control} disabled />}</Field>);

    expect(screen.getByLabelText('CV')).toBeDisabled();
  });
});
