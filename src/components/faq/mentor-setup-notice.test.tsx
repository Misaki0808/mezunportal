// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { renderUi } from '@/test/render';

import { MentorSetupNotice } from './mentor-setup-notice';

it('rol uyarısı değil, mentor ayarına giden tek eylemli açıklama gösterir', () => {
  renderUi(<MentorSetupNotice />);
  expect(screen.getByText('SSS sorularını yanıtlamak için mentor ayarını aç')).toBeVisible();
  expect(screen.queryByText(/rolün için değil/)).toBeNull();
  expect(screen.getByRole('link', { name: 'Mentor ayarlarını aç' })).toHaveAttribute(
    'href',
    '/mentor/ayarlar',
  );
});
