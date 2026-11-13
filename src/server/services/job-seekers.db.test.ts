import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { SEEKER_CARDS_PER_DAY, SEEKER_CONTACTS_PER_MONTH } from '@/contracts/job-seekers';
import { CURRENT_CONSENT_VERSIONS } from '@/contracts/privacy';
import { isCodedError } from '@/lib/errors';
import { createTestPrisma } from '@/test/db';
import {
  addMembership,
  createInstitution,
  createUser,
  grantRequiredConsents,
  type Institution,
} from '@/test/fixtures';

import { deleteAccount } from './accountDeletion';
import { buildDataExport } from './dataExport';
import { listContactRequests, respondToContactRequest, sendContactRequest } from './contactRequest';
import { settleEvents } from './event';
import {
  getMyHiringDeclaration,
  getMySeekerSettings,
  previewSeekerContact,
  requestSeekerContact,
  searchSeekers,
  setHiringDeclaration,
  setSeekerSettings,
  type JobSeekerDeps,
} from './job-seekers';
import { recordConsents } from './privacy';
import { RATE_LIMITS, consumeRateLimitBy } from './rateLimit';

const db = createTestPrisma();
const deps: JobSeekerDeps = { db };
afterAll(() => db.$disconnect());

let inst: Institution;
let other: Institution;
beforeEach(async () => {
  inst = await createInstitution(db);
  other = await createInstitution(db);
});

const VERSION = CURRENT_CONSENT_VERSIONS.JOB_SEEKER_VISIBILITY;
const code = async (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (isCodedError(error) ? error.code : `HATA:${String(error)}`),
  );
const consent = (userId: string, granted: boolean) =>
  recordConsents(db, userId, [
    { documentType: 'JOB_SEEKER_VISIBILITY', version: VERSION, granted },
  ]);

async function makeStudent(
  options: {
    institution?: Institution;
    departmentId?: string;
    name?: string;
    headline?: string | null;
    visible?: boolean;
    tags?: string[];
    termYear?: number;
    termSeason?: 'SPRING' | 'SUMMER' | 'AUTUMN' | 'WINTER';
  } = {},
) {
  const institution = options.institution ?? inst;
  const name = options.name ?? 'Elif Gizlioğlu';
  const userId = await createUser(db, { name });
  await addMembership(db, {
    userId,
    departmentId: options.departmentId ?? institution.deptA1,
    role: 'STUDENT',
    entryYear: 2025,
  });
  await grantRequiredConsents(db, userId);
  const profile = await db.profile.upsert({
    where: { userId },
    create: { userId, headline: options.headline ?? 'Veri analizi meraklısı' },
    update: { headline: options.headline ?? 'Veri analizi meraklısı' },
    select: { id: true },
  });
  for (const slug of options.tags ?? []) {
    const tag = await db.tag.upsert({
      where: { kind_slug: { kind: 'INTEREST', slug } },
      create: { kind: 'INTEREST', slug },
      update: {},
      select: { id: true },
    });
    await db.profileTag.create({ data: { profileId: profile.id, tagId: tag.id } });
  }
  if (options.visible !== false) {
    await consent(userId, true);
    await setSeekerSettings(deps, userId, {
      seekingInternship: true,
      ...(options.termYear
        ? { termYear: options.termYear, termSeason: options.termSeason ?? 'SUMMER' }
        : {}),
    });
  }
  const row = await db.profile.findUniqueOrThrow({
    where: { userId },
    select: { seekerRef: true },
  });
  const email = (
    await db.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } })
  ).email;
  return { userId, name, email, ref: row.seekerRef, profileId: profile.id };
}

async function makeAlumnus(
  options: { institution?: Institution; declared?: boolean; name?: string } = {},
) {
  const institution = options.institution ?? inst;
  const userId = await createUser(db, { name: options.name ?? 'Mehmet Yıldırım' });
  await addMembership(db, {
    userId,
    departmentId: institution.deptA1,
    role: 'ALUMNI',
    graduationYear: 2020,
  });
  await grantRequiredConsents(db, userId);
  if (options.declared !== false) await setHiringDeclaration(deps, userId, { hiring: true });
  return userId;
}

const refsOf = (page: { items: { ref: string }[] }) => page.items.map((item) => item.ref);

describe('P2-06 sızıntı: kart beyaz listedir, kimlik izi yoktur', () => {
  it('arama yanıtında ad/e-posta/kullanıcı kimliği/profil kimliği yoktur; kart anahtarları sabittir', async () => {
    const student = await makeStudent({ tags: ['veri-analizi', 'yazilim'], termYear: 2031 });
    const alumnus = await makeAlumnus();
    const page = await searchSeekers(deps, alumnus, { departmentId: inst.deptA1 });
    const card = page.items.find((item) => item.ref === student.ref);
    expect(card).toBeDefined();
    expect(Object.keys(card!).sort()).toEqual(
      [
        'classStanding',
        'departmentId',
        'departmentName',
        'headline',
        'ref',
        'tags',
        'termSeason',
        'termYear',
      ].sort(),
    );
    expect(card).toMatchObject({
      departmentName: 'Bölüm A1',
      headline: 'Veri analizi meraklısı',
      termYear: 2031,
      termSeason: 'SUMMER',
    });
    expect(card!.tags.map((tag) => tag.slug)).toEqual(['veri-analizi', 'yazilim']);
    const json = JSON.stringify(page);
    for (const secret of [
      student.userId,
      student.profileId,
      student.email,
      'Elif',
      'Gizlio',
      'elif',
      alumnus,
    ])
      expect(json, secret).not.toContain(secret);
    expect(page.items.length).toBe(page.total);
  });

  it('başlık satırında ad, e-posta, telefon ya da kimlik varsa satır HİÇ gösterilmez; kart yine görünür', async () => {
    const leaky = [
      'Elif Gizlioğlu — YBS 3',
      'ulaş: elif.g@example.com',
      '0532 123 45 67 numaramdan ara',
      'sadece elif',
    ];
    const students = [];
    for (const headline of leaky)
      students.push(await makeStudent({ headline, name: 'Elif Gizlioğlu' }));
    const clean = await makeStudent({ headline: '   Veri   analizi  meraklısı ' });
    const long = await makeStudent({ headline: 'a'.repeat(300) });
    const alumnus = await makeAlumnus();
    const page = await searchSeekers(deps, alumnus, { pageSize: 20 });
    for (const student of students)
      expect(
        page.items.find((item) => item.ref === student.ref)?.headline,
        student.userId,
      ).toBeNull();
    expect(page.items.find((item) => item.ref === clean.ref)?.headline).toBe(
      'Veri analizi meraklısı',
    );
    const cut = page.items.find((item) => item.ref === long.ref)?.headline;
    expect(cut?.length).toBe(120);
    expect(cut?.endsWith('…')).toBe(true);
  });

  it('serbest yazılmış (curated olmayan) beceri etiketi karta girmez ve süzgeçte eşleşmez', async () => {
    const student = await makeStudent({ tags: ['gizli-etiket-x'] });
    await db.tag.updateMany({ where: { slug: 'gizli-etiket-x' }, data: { curated: false } });
    const alumnus = await makeAlumnus();
    const page = await searchSeekers(deps, alumnus, { pageSize: 20 });
    expect(page.items.find((item) => item.ref === student.ref)?.tags).toEqual([]);
    const filtered = await searchSeekers(deps, alumnus, { tags: ['gizli-etiket-x'] });
    expect(refsOf(filtered)).not.toContain(student.ref);
  });

  it('önizleme ve talep yanıtı da adı/kimliği taşımaz; talep edene giden listede onaydan önce hedef yoktur', async () => {
    const student = await makeStudent();
    const alumnus = await makeAlumnus();
    const preview = await previewSeekerContact(deps, alumnus, { ref: student.ref! });
    expect(preview.canRequest).toBe(true);
    const sent = await requestSeekerContact(deps, alumnus, {
      ref: student.ref!,
      fields: ['EMAIL'],
    });
    expect(sent.status).toBe('PENDING');
    for (const value of [preview, sent])
      for (const secret of [student.userId, student.email, 'Elif', 'Gizlio'])
        expect(JSON.stringify(value), secret).not.toContain(secret);
    const outgoing = await listContactRequests(db, alumnus, { box: 'OUTGOING', limit: 50 });
    const item = outgoing.items.find((entry) => entry.id === sent.requestId)!;
    expect(item.counterpart).toBeNull();
    expect(item.origin).toMatchObject({ kind: 'SEEKER_PROFILE', organization: 'Bölüm A1' });
    for (const secret of [student.userId, 'Elif', 'Gizlio'])
      expect(JSON.stringify(outgoing), secret).not.toContain(secret);
    const incoming = await listContactRequests(db, student.userId, { box: 'INCOMING', limit: 50 });
    expect(incoming.items.find((entry) => entry.id === sent.requestId)?.counterpart?.userId).toBe(
      alumnus,
    );
  });
});

describe('P2-06 yetki', () => {
  it('yalnız doğrulanmış ve beyan vermiş mezun arar; öğrenci, akademisyen, beyansız ve doğrulanmamış mezun reddedilir', async () => {
    const student = await makeStudent();
    const academic = await createUser(db);
    await addMembership(db, { userId: academic, departmentId: inst.deptA1, role: 'ACADEMIC' });
    await grantRequiredConsents(db, academic);
    const undeclared = await makeAlumnus({ declared: false });
    const pending = await createUser(db);
    await addMembership(db, {
      userId: pending,
      departmentId: inst.deptA1,
      role: 'ALUMNI',
      status: 'PENDING',
    });
    await grantRequiredConsents(db, pending);
    const declared = await makeAlumnus();

    expect(await code(searchSeekers(deps, student.userId, {}))).toBe('AUTH_FORBIDDEN');
    expect(await code(searchSeekers(deps, academic, {}))).toBe('AUTH_FORBIDDEN');
    expect(await code(searchSeekers(deps, pending, {}))).not.toBeNull();
    expect(await code(searchSeekers(deps, undeclared, {}))).toBe(
      'SEEKER_HIRING_DECLARATION_REQUIRED',
    );
    expect(await code(previewSeekerContact(deps, undeclared, { ref: student.ref! }))).toBe(
      'SEEKER_HIRING_DECLARATION_REQUIRED',
    );
    expect(
      await code(requestSeekerContact(deps, undeclared, { ref: student.ref!, fields: ['EMAIL'] })),
    ).toBe('SEEKER_HIRING_DECLARATION_REQUIRED');
    expect(await code(searchSeekers(deps, declared, {}))).toBeNull();
  });

  it('beyan kaldırılınca arama ANINDA kapanır; yeniden açınca ilk beyan anı korunur', async () => {
    const alumnus = await makeAlumnus();
    const first = await getMyHiringDeclaration(deps, alumnus);
    expect(first.hiring).toBe(true);
    const again = await setHiringDeclaration(deps, alumnus, { hiring: true });
    expect(again.declaredAt).toEqual(first.declaredAt);
    expect(await setHiringDeclaration(deps, alumnus, { hiring: false })).toEqual({
      hiring: false,
      declaredAt: null,
    });
    expect(await code(searchSeekers(deps, alumnus, {}))).toBe('SEEKER_HIRING_DECLARATION_REQUIRED');
  });

  it('beyan eylemleri yalnız mezuna, ayarlar yalnız öğrenciye açıktır', async () => {
    const student = await makeStudent();
    const alumnus = await makeAlumnus();
    expect(await code(setHiringDeclaration(deps, student.userId, { hiring: true }))).toBe(
      'AUTH_FORBIDDEN',
    );
    expect(await code(getMySeekerSettings(deps, alumnus))).toBe('AUTH_FORBIDDEN');
    expect(await code(setSeekerSettings(deps, alumnus, { seekingInternship: false }))).toBe(
      'AUTH_FORBIDDEN',
    );
  });

  it('rıza vermeyen öğrenci görünürlüğü açamaz (SEEKER_CONSENT_REQUIRED); eski sürümde verilmiş rıza da yetmez', async () => {
    const student = await makeStudent({ visible: false });
    expect(await code(setSeekerSettings(deps, student.userId, { seekingInternship: true }))).toBe(
      'SEEKER_CONSENT_REQUIRED',
    );
    await db.consent.create({
      data: {
        userId: student.userId,
        documentType: 'JOB_SEEKER_VISIBILITY',
        version: 'eski-0',
        granted: true,
      },
    });
    expect(await code(setSeekerSettings(deps, student.userId, { seekingInternship: true }))).toBe(
      'SEEKER_CONSENT_REQUIRED',
    );
    const settings = await getMySeekerSettings(deps, student.userId);
    expect(settings.visible).toBe(false);
    expect(settings.consent).toMatchObject({ granted: false, needsAction: true });
  });
});

describe('P2-06 K-07 ve görünürlük kapsamı', () => {
  it('başka üniversitenin öğrencisi görünmez, o üniversitenin mezunu bizim öğrencimizi göremez', async () => {
    const mine = await makeStudent();
    const theirs = await makeStudent({ institution: other });
    const alumnus = await makeAlumnus();
    const alumnusOther = await makeAlumnus({ institution: other });
    const seen = refsOf(await searchSeekers(deps, alumnus, { pageSize: 20 }));
    expect(seen).toContain(mine.ref);
    expect(seen).not.toContain(theirs.ref);
    const seenOther = refsOf(await searchSeekers(deps, alumnusOther, { pageSize: 20 }));
    expect(seenOther).toContain(theirs.ref);
    expect(seenOther).not.toContain(mine.ref);
    // Kapsam dışı kartın opak kimliği önizleme/talepte "yok" gibi davranır.
    expect(await previewSeekerContact(deps, alumnus, { ref: theirs.ref! })).toMatchObject({
      canRequest: false,
    });
    expect(
      await code(requestSeekerContact(deps, alumnus, { ref: theirs.ref!, fields: ['EMAIL'] })),
    ).toBe('RESOURCE_NOT_FOUND');
  });

  it('aday iletişiminde yabancı, olmayan, askıdaki ve silinmiş aday aynı genel yanıtı verir', async () => {
    const own = await makeStudent();
    const theirs = await makeStudent({ institution: other });
    const alumnus = await makeAlumnus();
    const missingRef = 'missing-audit-reference';
    const missing = await previewSeekerContact(deps, alumnus, { ref: missingRef });
    const missingCode = await code(
      requestSeekerContact(deps, alumnus, { ref: missingRef, fields: ['EMAIL'] }),
    );
    expect(missingCode).toBe('RESOURCE_NOT_FOUND');
    expect(await previewSeekerContact(deps, alumnus, { ref: theirs.ref! })).toEqual(missing);
    expect(
      await code(requestSeekerContact(deps, alumnus, { ref: theirs.ref!, fields: ['EMAIL'] })),
    ).toBe(missingCode);
    for (const state of [{ banned: true }, { banned: false, deletedAt: new Date() }]) {
      await db.user.update({ where: { id: own.userId }, data: state });
      expect(await previewSeekerContact(deps, alumnus, { ref: own.ref! })).toEqual(missing);
      expect(
        await code(requestSeekerContact(deps, alumnus, { ref: own.ref!, fields: ['EMAIL'] })),
      ).toBe(missingCode);
    }
    expect(
      await db.contactRequest.count({ where: { targetId: { in: [own.userId, theirs.userId] } } }),
    ).toBe(0);
  });

  it('süzgeçler: bölüm, dönem, etiketlerin HEPSİ; kapalı/askıdaki/silinen öğrenci hiç çıkmaz', async () => {
    const tagged = await makeStudent({
      tags: ['alpha-x', 'beta-x'],
      termYear: 2032,
      termSeason: 'AUTUMN',
    });
    const half = await makeStudent({ tags: ['alpha-x'], termYear: 2032, termSeason: 'AUTUMN' });
    const dept2 = await makeStudent({ departmentId: inst.deptA2, tags: ['alpha-x', 'beta-x'] });
    const off = await makeStudent({ visible: false, tags: ['alpha-x', 'beta-x'] });
    const banned = await makeStudent({ tags: ['alpha-x', 'beta-x'] });
    await db.user.update({ where: { id: banned.userId }, data: { banned: true } });
    const alumnus = await makeAlumnus();

    const both = refsOf(
      await searchSeekers(deps, alumnus, { tags: ['alpha-x', 'beta-x'], pageSize: 20 }),
    );
    expect(both).toEqual(expect.arrayContaining([tagged.ref, dept2.ref]));
    for (const hidden of [half.ref, off.ref, banned.ref])
      expect(both, String(hidden)).not.toContain(hidden);
    expect(
      refsOf(
        await searchSeekers(deps, alumnus, {
          tags: ['alpha-x', 'beta-x'],
          departmentId: inst.deptA2,
        }),
      ),
    ).toEqual([dept2.ref]);
    const term = refsOf(
      await searchSeekers(deps, alumnus, { termYear: 2032, termSeason: 'AUTUMN', pageSize: 20 }),
    );
    expect(term).toEqual(expect.arrayContaining([tagged.ref, half.ref]));
    expect(term).not.toContain(dept2.ref);
  });

  it('kendi kartı gizlidir; profil talebi aramayı etkilemez, aynı aday kaynağı açık talebi dışlanır', async () => {
    const dual = await makeStudent();
    await addMembership(db, {
      userId: dual.userId,
      departmentId: inst.deptA2,
      role: 'ALUMNI',
      graduationYear: 2019,
    });
    await setHiringDeclaration(deps, dual.userId, { hiring: true });
    const known = await makeStudent();
    const alumnus = await makeAlumnus();
    expect(refsOf(await searchSeekers(deps, dual.userId, { pageSize: 20 }))).not.toContain(
      dual.ref,
    );

    expect(refsOf(await searchSeekers(deps, alumnus, { pageSize: 20 }))).toContain(known.ref);
    await sendContactRequest(db, alumnus, { targetUserId: known.userId, fields: ['EMAIL'] });
    expect(refsOf(await searchSeekers(deps, alumnus, { pageSize: 20 }))).toContain(known.ref);
    expect(await previewSeekerContact(deps, alumnus, { ref: known.ref! })).toMatchObject({
      canRequest: true,
    });
    await requestSeekerContact(deps, alumnus, { ref: known.ref!, fields: ['EMAIL'] });
    expect(refsOf(await searchSeekers(deps, alumnus, { pageSize: 20 }))).not.toContain(known.ref);
  });

  it('sıralama sayfalar arasında kararlıdır ve sayfalar çakışmaz', async () => {
    const students = [];
    for (let i = 0; i < 5; i += 1) students.push(await makeStudent({ departmentId: inst.deptA2 }));
    const alumnus = await makeAlumnus();
    const p1 = await searchSeekers(deps, alumnus, {
      departmentId: inst.deptA2,
      page: 1,
      pageSize: 2,
    });
    const p2 = await searchSeekers(deps, alumnus, {
      departmentId: inst.deptA2,
      page: 2,
      pageSize: 2,
    });
    expect(p1.total).toBeGreaterThanOrEqual(5);
    expect(refsOf(p1).filter((ref) => refsOf(p2).includes(ref))).toEqual([]);
    expect([...refsOf(p1), ...refsOf(p2)]).toEqual([...refsOf(p1), ...refsOf(p2)].sort());
  });
});

describe('P2-06 rıza geri alma ve kapatma', () => {
  it('rıza geri alınır alınmaz kart aramadan düşer, kimlik silinir, bekleyen talepler kapanır; onaylı talep kalır', async () => {
    const student = await makeStudent();
    const alumnus = await makeAlumnus();
    const second = await makeAlumnus();
    const pending = await requestSeekerContact(deps, alumnus, {
      ref: student.ref!,
      fields: ['EMAIL'],
    });
    const approved = await requestSeekerContact(deps, second, {
      ref: student.ref!,
      fields: ['EMAIL'],
    });
    await db.contactRequest.update({
      where: { id: approved.requestId },
      data: { status: 'APPROVED', decidedAt: new Date() },
    });

    await consent(student.userId, false);

    expect(refsOf(await searchSeekers(deps, second, { pageSize: 20 }))).not.toContain(student.ref);
    expect(await previewSeekerContact(deps, second, { ref: student.ref! })).toMatchObject({
      canRequest: false,
    });
    expect(
      await code(requestSeekerContact(deps, alumnus, { ref: student.ref!, fields: ['EMAIL'] })),
    ).toBe('RESOURCE_NOT_FOUND');
    const profile = await db.profile.findUniqueOrThrow({ where: { userId: student.userId } });
    expect(profile).toMatchObject({ seekingInternship: false, seekerRef: null });
    expect(
      (await db.contactRequest.findUniqueOrThrow({ where: { id: pending.requestId } })).status,
    ).toBe('REJECTED');
    expect(
      (await db.contactRequest.findUniqueOrThrow({ where: { id: approved.requestId } })).status,
    ).toBe('APPROVED');
    const settings = await getMySeekerSettings(deps, student.userId);
    expect(settings).toMatchObject({ seekingInternship: false, visible: false });
  });

  it('çözümleme ile yazma arasında rıza geri alınırsa talep kapatılır ve istek "bulunamadı" döner (yarış telafisi)', async () => {
    const student = await makeStudent();
    const alumnus = await makeAlumnus();
    let armed = true;
    // Talebi yazan işlemden hemen sonra (yeniden doğrulamadan önce) öğrenci rızayı geri alır.
    const racing = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop !== '$transaction') return Reflect.get(target, prop, receiver) as unknown;
        return async (run: never, options: never) => {
          const result = (await target.$transaction(run, options)) as unknown;
          const created = (result as { id?: unknown } | null)?.id;
          if (armed && typeof created === 'string') {
            armed = false;
            await consent(student.userId, false);
          }
          return result;
        };
      },
    });
    expect(
      await code(
        requestSeekerContact({ db: racing }, alumnus, { ref: student.ref!, fields: ['EMAIL'] }),
      ),
    ).toBe('RESOURCE_NOT_FOUND');
    expect(armed).toBe(false);
    const rows = await db.contactRequest.findMany({ where: { requesterId: alumnus } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: 'SEEKER_PROFILE', status: 'REJECTED' });
  });

  it('görünürlük SORGU ANINDA denetlenir: temizlik çalışmasa bile son rıza satırı geri alınmışsa kart yoktur', async () => {
    const student = await makeStudent();
    const alumnus = await makeAlumnus();
    expect(refsOf(await searchSeekers(deps, alumnus, { pageSize: 20 }))).toContain(student.ref);
    // recordConsents'i atlayan doğrudan rıza satırı (temizlik hiç çalışmadı): bayrak ve ref hâlâ dolu.
    await db.consent.create({
      data: {
        userId: student.userId,
        documentType: 'JOB_SEEKER_VISIBILITY',
        version: VERSION,
        granted: false,
      },
    });
    const profile = await db.profile.findUniqueOrThrow({ where: { userId: student.userId } });
    expect(profile.seekingInternship).toBe(true);
    expect(refsOf(await searchSeekers(deps, alumnus, { pageSize: 20 }))).not.toContain(student.ref);
    expect(await previewSeekerContact(deps, alumnus, { ref: student.ref! })).toMatchObject({
      canRequest: false,
    });
    expect((await getMySeekerSettings(deps, student.userId)).visible).toBe(false);
    // Rıza yeniden verilince (daha yeni satır) kart geri gelir.
    await db.consent.create({
      data: {
        userId: student.userId,
        documentType: 'JOB_SEEKER_VISIBILITY',
        version: VERSION,
        granted: true,
      },
    });
    expect(refsOf(await searchSeekers(deps, alumnus, { pageSize: 20 }))).toContain(student.ref);
  });

  it('metin sürümü değişirse (eski sürümde verilmiş rıza) kart görünmez', async () => {
    const student = await makeStudent();
    const alumnus = await makeAlumnus();
    await db.consent.create({
      data: {
        userId: student.userId,
        documentType: 'JOB_SEEKER_VISIBILITY',
        version: 'eski-0',
        granted: true,
      },
    });
    expect(refsOf(await searchSeekers(deps, alumnus, { pageSize: 20 }))).not.toContain(student.ref);
  });

  it('öğrenci kapatınca kimlik silinir, bekleyen talep kapanır; yeniden açınca YENİ kimlik ve sıfır sayaç', async () => {
    const student = await makeStudent();
    const alumnus = await makeAlumnus();
    await searchSeekers(deps, alumnus, { pageSize: 20 });
    expect((await getMySeekerSettings(deps, student.userId)).viewCount).toBe(1);
    const pending = await requestSeekerContact(deps, alumnus, {
      ref: student.ref!,
      fields: ['EMAIL'],
    });

    const off = await setSeekerSettings(deps, student.userId, { seekingInternship: false });
    expect(off).toMatchObject({ seekingInternship: false, visible: false });
    expect(
      (await db.profile.findUniqueOrThrow({ where: { userId: student.userId } })).seekerRef,
    ).toBeNull();
    expect(
      (await db.contactRequest.findUniqueOrThrow({ where: { id: pending.requestId } })).status,
    ).toBe('REJECTED');

    const on = await setSeekerSettings(deps, student.userId, { seekingInternship: true });
    expect(on).toMatchObject({ visible: true, viewCount: 0 });
    const reopened = (await db.profile.findUniqueOrThrow({ where: { userId: student.userId } }))
      .seekerRef;
    expect(reopened).not.toBeNull();
    expect(reopened).not.toBe(student.ref);
    // Eski bağlantı geçersiz.
    expect(
      await code(requestSeekerContact(deps, alumnus, { ref: student.ref!, fields: ['EMAIL'] })),
    ).toBe('RESOURCE_NOT_FOUND');
  });

  it('açıkken ayarı yeniden kaydetmek kimliği değiştirmez; dönem yıl+mevsim birlikte', async () => {
    const student = await makeStudent();
    await setSeekerSettings(deps, student.userId, {
      seekingInternship: true,
      termYear: 2031,
      termSeason: 'SPRING',
    });
    const after = await db.profile.findUniqueOrThrow({ where: { userId: student.userId } });
    expect(after.seekerRef).toBe(student.ref);
    expect(after).toMatchObject({ seekingTermYear: 2031, seekingTermSeason: 'SPRING' });
    const settings = await getMySeekerSettings(deps, student.userId);
    expect(settings.preview).toMatchObject({ termYear: 2031, departmentName: 'Bölüm A1' });
    const dump = await buildDataExport(db, student.userId);
    expect(dump.profile).toMatchObject({
      seekingInternship: true,
      seekingTermYear: 2031,
      seekingTermSeason: 'SPRING',
      seekerViewCount: expect.any(Number),
      hiringDeclaredAt: null,
    });
    expect(dump.profile).not.toHaveProperty('seekerRef');
    expect(JSON.stringify(dump)).not.toContain(student.ref);
    expect(JSON.stringify(settings.preview)).not.toContain(student.ref!);
  });

  it('hesap silinince kart yok olur ve döküm/silme sonrası hiçbir yanıtta görünmez', async () => {
    const student = await makeStudent();
    const alumnus = await makeAlumnus();
    expect(refsOf(await searchSeekers(deps, alumnus, { pageSize: 20 }))).toContain(student.ref);
    await deleteAccount(
      db,
      student.userId,
      { publishedContent: 'DELETE', confirmEmail: student.email },
      { removeStoredFiles: null },
    );
    expect(refsOf(await searchSeekers(deps, alumnus, { pageSize: 20 }))).not.toContain(student.ref);
    expect(await db.profile.count({ where: { userId: student.userId } })).toBe(0);
    expect(
      await code(requestSeekerContact(deps, alumnus, { ref: student.ref!, fields: ['EMAIL'] })),
    ).toBe('RESOURCE_NOT_FOUND');
  });
});

describe('P2-06 hız sınırı, sayaç ve olay', () => {
  it('günlük kart hakkı DÖNEN KART kadar azalır; hak kısmen yeterse sayfa kısalır, bitince RATE_LIMITED', async () => {
    const students = [];
    for (let i = 0; i < 3; i += 1) students.push(await makeStudent({ departmentId: inst.deptA2 }));
    const alumnus = await makeAlumnus();
    await consumeRateLimitBy(db, RATE_LIMITS.seekerCards, alumnus, SEEKER_CARDS_PER_DAY - 2);
    const page = await searchSeekers(deps, alumnus, { departmentId: inst.deptA2, pageSize: 20 });
    expect(page.items).toHaveLength(2);
    expect(page.remainingCardsToday).toBe(0);
    expect(page.total).toBeGreaterThanOrEqual(3);
    expect(await code(searchSeekers(deps, alumnus, { departmentId: inst.deptA2 }))).toBe(
      'RATE_LIMITED',
    );
    expect(await code(searchSeekers(deps, alumnus, { departmentId: inst.deptA2, page: 2 }))).toBe(
      'RATE_LIMITED',
    );
  });

  it('günlük hak yeni bir günde (pencere dolunca) yenilenir', async () => {
    await makeStudent({ departmentId: inst.deptA2 });
    const alumnus = await makeAlumnus();
    await consumeRateLimitBy(db, RATE_LIMITS.seekerCards, alumnus, SEEKER_CARDS_PER_DAY);
    expect(await code(searchSeekers(deps, alumnus, {}))).toBe('RATE_LIMITED');
    const tomorrow = new Date(Date.now() + 25 * 60 * 60 * 1000);
    const page = await searchSeekers({ db, now: () => tomorrow }, alumnus, {});
    expect(page.remainingCardsToday).toBeLessThan(SEEKER_CARDS_PER_DAY);
  });

  it('aylık 20 talep sınırı aşılınca RATE_LIMITED; talep oluşmaz', async () => {
    const student = await makeStudent();
    const alumnus = await makeAlumnus();
    await consumeRateLimitBy(db, RATE_LIMITS.seekerContact, alumnus, SEEKER_CONTACTS_PER_MONTH);
    expect(
      await code(requestSeekerContact(deps, alumnus, { ref: student.ref!, fields: ['EMAIL'] })),
    ).toBe('RATE_LIMITED');
    expect(await db.contactRequest.count({ where: { requesterId: alumnus } })).toBe(0);
  });

  it('görüntülenme sayacı yalnız dönen kartlara eklenir; kim baktığı hiçbir yerde tutulmaz', async () => {
    const a = await makeStudent({ departmentId: inst.deptA2 });
    const b = await makeStudent({ departmentId: inst.deptA2, tags: ['nadir-sayac-x'] });
    const alumnus = await makeAlumnus();
    await searchSeekers(deps, alumnus, { tags: ['nadir-sayac-x'] });
    expect((await getMySeekerSettings(deps, b.userId)).viewCount).toBe(1);
    expect((await getMySeekerSettings(deps, a.userId)).viewCount).toBe(0);
    await searchSeekers(deps, alumnus, { tags: ['nadir-sayac-x'] });
    expect((await getMySeekerSettings(deps, b.userId)).viewCount).toBe(2);
    const columns = await db.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'Profile' AND column_name ILIKE '%viewer%'`;
    expect(columns).toEqual([]);
  });

  it('her arama JOB_SEEKER_SEARCH olayıdır; yalnız sonuç kovası yazılır (kart, süzgeç, aday yok)', async () => {
    const student = await makeStudent({ tags: ['olay-etiketi-x'] });
    const alumnus = await makeAlumnus();
    await searchSeekers(deps, alumnus, { tags: ['olay-etiketi-x'], departmentId: inst.deptA1 });
    await settleEvents();
    const events = await db.event.findMany({
      where: { type: 'JOB_SEEKER_SEARCH', userId: alumnus },
    });
    expect(events).toHaveLength(1);
    expect(events[0]!.props).toEqual({ results: 'FEW' });
    const text = JSON.stringify(events);
    for (const secret of [student.userId, 'olay-etiketi-x', student.ref!])
      expect(text).not.toContain(secret);
  });
});

// R2: bilinen profil ile anonim aday bağının onaydan önce kurulamadığını doğrular.
describe('P2-06 R2 çapraz kaynak gizlilik regresyonu', () => {
  it('aday talebi, bilinen profil talebinin yanıtıyla kimliğe bağlanamaz', async () => {
    const hidden = await makeStudent({ name: 'Gizli Kişi' });
    const other = await makeStudent({ name: 'Başka Kişi' });
    const alumnus = await makeAlumnus();
    await requestSeekerContact(deps, alumnus, { ref: hidden.ref!, fields: ['EMAIL'] });
    const hiddenCode = await code(
      sendContactRequest(db, alumnus, { targetUserId: hidden.userId, fields: ['EMAIL'] }),
    );
    const otherCode = await code(
      sendContactRequest(db, alumnus, { targetUserId: other.userId, fields: ['EMAIL'] }),
    );
    expect(hiddenCode).toBe(otherCode);
  });
  it('bilinen profil talebi arama kümesinden tek opak kartı düşürüp kimliği ele vermez', async () => {
    const hidden = await makeStudent({ name: 'Gizli Kişi' });
    const alumnus = await makeAlumnus();
    const before = refsOf(await searchSeekers(deps, alumnus, { pageSize: 20 }));
    await sendContactRequest(db, alumnus, { targetUserId: hidden.userId, fields: ['EMAIL'] });
    const after = refsOf(await searchSeekers(deps, alumnus, { pageSize: 20 }));
    expect(after).toEqual(before);
  });
});

describe('P2-06 R2 bağlamlı taleplerde onay atomikliği', () => {
  it('farklı kaynaklar eşzamanlı onaylanır; aynı kaynakta tekrar engellenir', async () => {
    const student = await makeStudent();
    const alumnus = await makeAlumnus();
    const a = await requestSeekerContact(deps, alumnus, { ref: student.ref!, fields: ['EMAIL'] });
    const b = await sendContactRequest(db, alumnus, {
      targetUserId: student.userId,
      fields: ['EMAIL'],
    });
    expect(a.requestId).not.toBe(b.requestId);
    const decisions = await Promise.allSettled(
      [a, b].map((x) =>
        respondToContactRequest(db, student.userId, {
          requestId: x.requestId,
          decision: 'APPROVE',
        }),
      ),
    );
    expect(decisions.filter((x) => x.status === 'fulfilled')).toHaveLength(2);
    const rows = await db.contactRequest.findMany({
      where: { requesterId: alumnus, targetId: student.userId },
    });
    expect(rows.map((x) => x.status)).toEqual(['APPROVED', 'APPROVED']);
    expect(
      await code(
        sendContactRequest(db, alumnus, { targetUserId: student.userId, fields: ['EMAIL'] }),
      ),
    ).toBe('CONTACT_REQUEST_ALREADY_OPEN');
  });
  it('açık talebin başka kişi tarafından onaylanması 404 olur', async () => {
    const student = await makeStudent(),
      attacker = await makeStudent(),
      alumnus = await makeAlumnus();
    const sent = await requestSeekerContact(deps, alumnus, {
      ref: student.ref!,
      fields: ['EMAIL'],
    });
    expect(
      await code(
        respondToContactRequest(db, attacker.userId, {
          requestId: sent.requestId,
          decision: 'APPROVE',
        }),
      ),
    ).toBe('RESOURCE_NOT_FOUND');
    expect(
      (await db.contactRequest.findUniqueOrThrow({ where: { id: sent.requestId } })).status,
    ).toBe('PENDING');
  });
});

describe('P2-06 R2 veritabanı yarış sınırları', () => {
  it('kalan tek günlük kart iki eşzamanlı aramada yalnız bir kez gösterilir', async () => {
    const student = await makeStudent();
    const alumnus = await makeAlumnus();
    await consumeRateLimitBy(db, RATE_LIMITS.seekerCards, alumnus, 49);
    const results = await Promise.allSettled([1, 2].map(() => searchSeekers(deps, alumnus, {})));
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const fail = results.find((x) => x.status === 'rejected') as PromiseRejectedResult;
    expect(isCodedError(fail.reason) && fail.reason.code).toBe('RATE_LIMITED');
    expect((await getMySeekerSettings(deps, student.userId)).viewCount).toBe(1);
  });
  it('kalan tek aylık hak iki ayrı aday talebinde yalnız bir kez harcanır', async () => {
    const a = await makeStudent(),
      b = await makeStudent(),
      alumnus = await makeAlumnus();
    await consumeRateLimitBy(db, RATE_LIMITS.seekerContact, alumnus, 19);
    const results = await Promise.allSettled(
      [a, b].map((s) => requestSeekerContact(deps, alumnus, { ref: s.ref!, fields: ['EMAIL'] })),
    );
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const fail = results.find((x) => x.status === 'rejected') as PromiseRejectedResult;
    expect(isCodedError(fail.reason) && fail.reason.code).toBe('RATE_LIMITED');
    expect(await db.contactRequest.count({ where: { requesterId: alumnus } })).toBe(1);
  });
  it('DB farklı kaynakta ikinci APPROVED kaydına izin verir', async () => {
    const student = await makeStudent(),
      alumnus = await makeAlumnus();
    const a = await requestSeekerContact(deps, alumnus, { ref: student.ref!, fields: ['EMAIL'] });
    const b = await sendContactRequest(db, alumnus, {
      targetUserId: student.userId,
      fields: ['EMAIL'],
    });
    await db.contactRequest.update({
      where: { id: a.requestId },
      data: { status: 'APPROVED', decidedAt: new Date() },
    });
    await db.contactRequest.update({
      where: { id: b.requestId },
      data: { status: 'APPROVED', decidedAt: new Date() },
    });
    expect(
      await db.contactRequest.count({
        where: { requesterId: alumnus, targetId: student.userId, status: 'APPROVED' },
      }),
    ).toBe(2);
  });
});

it('147 bağımsız ölçüm: daha önce onaylanmış profil talebi anonim adayla eşlenemez', async () => {
  const known = await makeStudent({ name: 'Bilinen Öğrenci' });
  const unrelated = await makeStudent({ name: 'Başka Öğrenci' });
  const alumnus = await makeAlumnus();
  const profileRequest = await sendContactRequest(db, alumnus, {
    targetUserId: known.userId,
    fields: ['EMAIL'],
  });
  await respondToContactRequest(db, known.userId, {
    requestId: profileRequest.requestId,
    decision: 'APPROVE',
  });
  const shown = refsOf(await searchSeekers(deps, alumnus, { pageSize: 20 }));
  expect(shown).toContain(known.ref);
  expect(shown).toContain(unrelated.ref);
  const results = await Promise.all([
    code(requestSeekerContact(deps, alumnus, { ref: known.ref!, fields: ['EMAIL'] })),
    code(requestSeekerContact(deps, alumnus, { ref: unrelated.ref!, fields: ['EMAIL'] })),
  ]);
  expect(results).toEqual([null, null]);
});

it('147 bağımsız ölçüm: profil onayı başka aday isteği durumunu değiştirmemeli', async () => {
  const hidden = await makeStudent();
  const other = await makeStudent();
  const alumnus = await makeAlumnus();
  const a = await requestSeekerContact(deps, alumnus, { ref: hidden.ref!, fields: ['EMAIL'] });
  const b = await requestSeekerContact(deps, alumnus, { ref: other.ref!, fields: ['EMAIL'] });
  const profile = await sendContactRequest(db, alumnus, {
    targetUserId: hidden.userId,
    fields: ['EMAIL'],
  });
  await respondToContactRequest(db, hidden.userId, {
    requestId: profile.requestId,
    decision: 'APPROVE',
  });
  const out = await listContactRequests(db, alumnus, { box: 'OUTGOING', limit: 50 });
  expect(out.items.find((item) => item.id === a.requestId)?.status).toBe('PENDING');
  expect(out.items.find((item) => item.id === b.requestId)?.status).toBe('PENDING');
});

it('147 iki yön: bekleyen profil talebi anonim aday isteği yanıtını etkilemez', async () => {
  const hidden = await makeStudent();
  const other = await makeStudent();
  const alumnus = await makeAlumnus();
  await sendContactRequest(db, alumnus, { targetUserId: hidden.userId, fields: ['EMAIL'] });
  const a = await code(
    requestSeekerContact(deps, alumnus, { ref: hidden.ref!, fields: ['EMAIL'] }),
  );
  const b = await code(requestSeekerContact(deps, alumnus, { ref: other.ref!, fields: ['EMAIL'] }));
  expect([a, b]).toEqual([null, null]);
});

it('R2 süresi dolan askı tam sınır anında aday görünürlüğünü geri açar', async () => {
  const student = await makeStudent(),
    alumnus = await makeAlumnus(),
    now = new Date();
  const fixed = { db, now: () => now };
  await db.user.update({
    where: { id: student.userId },
    data: { banned: true, banExpires: new Date(+now + 1) },
  });
  expect(refsOf(await searchSeekers(fixed, alumnus, {}))).not.toContain(student.ref);
  await db.user.update({ where: { id: student.userId }, data: { banExpires: now } });
  expect((await getMySeekerSettings(fixed, student.userId)).visible).toBe(true);
  expect(refsOf(await searchSeekers(fixed, alumnus, {}))).toContain(student.ref);
  expect(await previewSeekerContact(fixed, alumnus, { ref: student.ref! })).toMatchObject({
    canRequest: true,
  });
  expect(
    await requestSeekerContact(fixed, alumnus, { ref: student.ref!, fields: ['EMAIL'] }),
  ).toMatchObject({ status: 'PENDING' });
});
