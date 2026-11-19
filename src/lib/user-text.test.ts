import { describe, expect, it } from 'vitest';
import { adminReason, adminSearchText, createDictionaryEntrySchema } from '@/contracts/admin';
import { alumniSearchSchema } from '@/contracts/alumni-directory';
import { searchMentorsSchema } from '@/contracts/mentor-directory';
import { searchExperiencesSchema } from '@/contracts/search';
import { saveStorySchema } from '@/contracts/alumni-story';
import { submitFaqRequestSchema } from '@/contracts/faq';
import { feedbackInputSchema } from '@/contracts/feedback';
import { cleanCvText } from '@/contracts/cv';
import { requestAppointmentSchema } from '@/contracts/appointment';
import { sendContactRequestSchema } from '@/contracts/contact-request';
import { proposeReferralAcceptanceSchema } from '@/contracts/referrals';
import { jobPostingDraftContentSchema } from '@/contracts/job-postings';
import { suggestSkillsSchema } from '@/contracts/profile-content';
import { normalizeUserText, userTextLength, userTextSchema } from './user-text';

describe('kullanıcı metni NFC sınırı', () => {
  it('önce kırpar ve NFC yapar, sonra emoji dahil Unicode kod noktalarını sayar', () => {
    const nfd = 'İ'.normalize('NFD');
    expect(userTextLength(`  ${nfd.repeat(251)}  `)).toBe(251);
    expect(userTextLength('🙂'.repeat(500))).toBe(500);
    expect(userTextSchema(0, 500).parse(`  ${nfd.repeat(500)}  `)).toBe('İ'.repeat(500));
    expect(userTextSchema(0, 500).safeParse(nfd.repeat(501)).success).toBe(false);
    expect(normalizeUserText('  I\u0307  ')).toBe('İ');
  });

  it('hikâye, SSS, geri bildirim ve CV metinleri de yeni girdiyi NFC ile saklanabilir üretir', () => {
    const nfd = 'İ'.normalize('NFD').repeat(251);
    const nfc = 'İ'.repeat(251);
    expect(saveStorySchema.parse({ departmentId: 'd1', body: nfd, consent: true }).body).toBe(nfc);
    expect(
      submitFaqRequestSchema.parse({ question: nfd, similarAcknowledged: true }).question,
    ).toBe(nfc);
    expect(
      feedbackInputSchema.parse({ appointmentId: 'a1', happened: true, helpful: true, note: nfd })
        .note,
    ).toBe(nfc);
    expect(cleanCvText(nfd)).toBe(nfc);
  });

  it('arama filtreleri de ayrışık Türkçe harfleri aynı sınırla değerlendirir', () => {
    const q = 'İ'.normalize('NFD').repeat(51);
    const normalized = 'İ'.repeat(51);
    expect(alumniSearchSchema.parse({ q }).q).toBe(normalized);
    expect(searchMentorsSchema.parse({ q }).q).toBe(normalized);
    expect(searchExperiencesSchema.parse({ q }).q).toBe(normalized);
  });

  it('taslak, yönetim araması, sözlük ve beceri önerisi NFC sınırını aynı uygular', () => {
    const nfd = 'İ'.normalize('NFD');
    expect(jobPostingDraftContentSchema.parse({ title: nfd.repeat(100) }).title).toBe(
      'İ'.repeat(100),
    );
    expect(jobPostingDraftContentSchema.safeParse({ title: nfd.repeat(121) }).success).toBe(false);
    expect(adminSearchText.parse(nfd.repeat(100))).toBe('İ'.repeat(100));
    expect(adminSearchText.safeParse(nfd.repeat(101)).success).toBe(false);
    const dictionary = createDictionaryEntrySchema.parse({
      kind: 'SKILL',
      name: nfd.repeat(200),
      aliases: [nfd.repeat(100)],
    });
    expect(dictionary.name).toBe('İ'.repeat(200));
    expect(dictionary.aliases).toEqual(['İ'.repeat(100)]);
    expect(
      createDictionaryEntrySchema.safeParse({ kind: 'SKILL', name: nfd.repeat(201) }).success,
    ).toBe(false);
    expect(suggestSkillsSchema.parse({ query: nfd.repeat(80) }).query).toBe('İ'.repeat(80));
    expect(suggestSkillsSchema.safeParse({ query: nfd.repeat(81) }).success).toBe(false);
  });

  it('251 NFD harfli iletişim notu ve randevu notu kabul edilir, NFC sonuç döner', () => {
    const nfd = 'İ'.normalize('NFD').repeat(251);
    const message = sendContactRequestSchema.parse({
      targetUserId: 'target',
      fields: ['EMAIL'],
      message: nfd,
    });
    expect(message.message).toBe('İ'.repeat(251));
    const appointment = requestAppointmentSchema.parse({
      mentorId: 'mentor',
      startsAt: new Date('2030-06-17T06:00:00Z'),
      mode: 'ONLINE',
      note: nfd,
    });
    expect(appointment.note).toBe('İ'.repeat(251));
    expect(proposeReferralAcceptanceSchema.parse({ referralId: 'ref', note: nfd }).note).toBe(
      'İ'.repeat(251),
    );
    expect(adminReason.parse(`  ${nfd}  `)).toBe('İ'.repeat(251));
  });
});
