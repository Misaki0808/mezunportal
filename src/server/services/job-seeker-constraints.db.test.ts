import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestPrisma } from '@/test/db';
import { createInstitution, createUser, type Institution } from '@/test/fixtures';

import { listContactRequests } from './contactRequest';

const db = createTestPrisma();
afterAll(() => db.$disconnect());

let inst: Institution;
beforeAll(async () => {
  inst = await createInstitution(db);
});

async function profileOf(userId: string) {
  return db.profile.upsert({ where: { userId }, create: { userId }, update: {} });
}

describe('P2-06 veritabanı değişmezleri (migration CHECK)', () => {
  it('görünürlük bayrağı ve opak kimlik birlikte: bayrak açıkken ref zorunlu, kapalıyken ref yasak', async () => {
    const userId = await createUser(db);
    await profileOf(userId);
    const set = (data: object) => db.profile.update({ where: { userId }, data });
    await expect(set({ seekingInternship: true })).rejects.toThrow(); // ref yok
    await expect(set({ seekerRef: 'a'.repeat(20) })).rejects.toThrow(); // bayrak kapalı + ref
    await expect(set({ seekingInternship: true, seekerRef: 'kisa' })).rejects.toThrow(); // çok kısa
    await expect(
      set({ seekingInternship: true, seekerRef: 'a1b2c3d4-e5f6-4a7b-8c9d-0123456789ab' }),
    ).resolves.toBeTruthy();
    await expect(set({ seekingInternship: false })).rejects.toThrow(); // ref hâlâ dolu
    await expect(set({ seekingInternship: false, seekerRef: null })).resolves.toBeTruthy();
  });

  it('opak kimlik benzersizdir; dönem yılı 2020-2100 aralığındadır', async () => {
    const [a, b] = [await createUser(db), await createUser(db)];
    await profileOf(a);
    await profileOf(b);
    const ref = 'f0e1d2c3-b4a5-4968-8776-5544332211ff';
    await db.profile.update({
      where: { userId: a },
      data: { seekingInternship: true, seekerRef: ref },
    });
    await expect(
      db.profile.update({
        where: { userId: b },
        data: { seekingInternship: true, seekerRef: ref },
      }),
    ).rejects.toThrow();
    await expect(
      db.profile.update({ where: { userId: b }, data: { seekingTermYear: 2019 } }),
    ).rejects.toThrow();
    await expect(
      db.profile.update({ where: { userId: b }, data: { seekingTermYear: 2101 } }),
    ).rejects.toThrow();
    await expect(
      db.profile.update({
        where: { userId: b },
        data: { seekingTermYear: 2031, seekingTermSeason: 'SUMMER' },
      }),
    ).resolves.toBeTruthy();
  });

  it('iletişim talebi kaynağı: SEEKER_PROFILE özet ister ve ilan bağı taşıyamaz; PROFILE iz taşıyamaz', async () => {
    const [requester, target] = [await createUser(db), await createUser(db)];
    const base = { requesterId: requester, targetId: target, fields: ['EMAIL' as const] };
    await expect(
      db.contactRequest.create({ data: { ...base, source: 'SEEKER_PROFILE' } }),
    ).rejects.toThrow();
    await expect(
      db.contactRequest.create({
        data: {
          ...base,
          source: 'SEEKER_PROFILE',
          sourceTitle: 'YBS · 3. sınıf',
          sourceOrganization: ' ',
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.contactRequest.create({ data: { ...base, sourceTitle: 'x', sourceOrganization: 'y' } }),
    ).rejects.toThrow(); // PROFILE + iz
    await expect(
      db.contactRequest.create({
        data: {
          ...base,
          source: 'SEEKER_PROFILE',
          sourceTitle: 'YBS · 3. sınıf',
          sourceOrganization: 'Yönetim Bilişim',
        },
      }),
    ).resolves.toBeTruthy();
  });
});

describe('D7 genelleştirmesi: aday kartı kaynaklı talepte hedef kimliği onaydan önce açılmaz', () => {
  it('giden listede PENDING/REJECTED/WITHDRAWN/REVOKED: counterpart null + origin SEEKER_PROFILE; APPROVED açılır', async () => {
    void inst;
    const requester = await createUser(db, { name: 'İşe Alımcı Mezun' });
    const student = await createUser(db, { name: 'Elif Gizli Aday' });
    const make = (status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN' | 'REVOKED') =>
      db.contactRequest.create({
        data: {
          requesterId: requester,
          targetId: student,
          fields: ['EMAIL'],
          source: 'SEEKER_PROFILE',
          sourceTitle: 'Veri analizi meraklısı',
          sourceOrganization: 'Yönetim Bilişim Sistemleri',
          status,
          // ContactRequest_shape_check: karar anı APPROVED/REJECTED/REVOKED'da, kapanış anı WITHDRAWN/REVOKED'da.
          ...(['APPROVED', 'REJECTED', 'REVOKED'].includes(status)
            ? { decidedAt: new Date() }
            : {}),
          ...(['WITHDRAWN', 'REVOKED'].includes(status) ? { closedAt: new Date() } : {}),
        },
      });
    // aynı ikili ve kaynak bağlamı için aynı anda tek açık talep: durumları sırayla yaz
    for (const status of ['REJECTED', 'WITHDRAWN', 'REVOKED', 'PENDING'] as const)
      await make(status);
    const open = await listContactRequests(db, requester, { box: 'OUTGOING', limit: 50 });
    for (const item of open.items) {
      expect(item.counterpart, item.status).toBeNull();
      expect(item.origin).toMatchObject({
        kind: 'SEEKER_PROFILE',
        title: 'Veri analizi meraklısı',
      });
      expect(JSON.stringify(item)).not.toContain(student);
      expect(JSON.stringify(item)).not.toContain('Elif');
    }
    await db.contactRequest.updateMany({
      where: { requesterId: requester, status: 'PENDING' },
      data: { status: 'APPROVED', decidedAt: new Date() },
    });
    const approved = (
      await listContactRequests(db, requester, { box: 'OUTGOING', limit: 50, status: 'APPROVED' })
    ).items[0]!;
    expect(approved.counterpart).toEqual({ userId: student, name: 'Elif Gizli Aday' });
    // gelen kutusunda aday (hedef) talep edeni ve kaynağı görür
    const incoming = await listContactRequests(db, student, { box: 'INCOMING', limit: 50 });
    expect(incoming.items[0]).toMatchObject({
      counterpart: { userId: requester },
      origin: { kind: 'SEEKER_PROFILE' },
    });
  });
});
