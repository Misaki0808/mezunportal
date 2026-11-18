// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { renderUi } from '@/test/render';
import { EntryEditor } from './entry-editor';

it('elle iş açıklaması çok uzunsa alan hatasıyla reddeder ve metni korur', async () => {
  const onSubmit = vi.fn();
  const { user } = renderUi(
    <EntryEditor
      section="POSITION"
      initial={{ company: 'Örnek', title: 'Analist' }}
      submitLabel="Kaydet"
      cancelLabel="Vazgeç"
      onSubmit={onSubmit}
      onCancel={vi.fn()}
    />,
  );
  const input = screen.getByLabelText('Açıklama');
  const value = 'a'.repeat(1001);
  fireEvent.change(input, { target: { value } });
  await user.click(screen.getByRole('button', { name: 'Kaydet' }));
  expect(onSubmit).not.toHaveBeenCalled();
  expect(input).toHaveValue(value);
  expect(input).toBeInvalid();
  expect(input).toHaveAccessibleDescription('Bu alan çok uzun.');
  expect(input).toHaveFocus();
});
