import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Şema kaynağı üzerinde değişmez denetimleri (docs/data.md). Ekran kaynağı taranmaz; şema, sözleşmenin
// kendisidir.
const schema = readFileSync(new URL('./schema.prisma', import.meta.url), 'utf8');

function modelBlocks(): Record<string, string> {
  const blocks: Record<string, string> = {};
  for (const match of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    const [, name, body] = match;
    if (name && body !== undefined) blocks[name] = body;
  }
  return blocks;
}

const models = modelBlocks();
const IDENTITY_MODELS = ['User', 'Membership', 'AdminGrant', 'MentorProfile', 'AdminAuditLog'];

describe('şema değişmezleri', () => {
  it('kimlik/üyelik/yetki/kayıt modelleri şemada vardır', () => {
    for (const name of IDENTITY_MODELS) expect(models[name], name).toBeDefined();
  });

  it('içerik ve puan üyeliğe değil kullanıcıya bağlanır: hiçbir model Membership’e yabancı anahtarla bağlanmaz', () => {
    // Rol geçişinde (STUDENT → ALUMNI) üyelik satırı kapanır; üyeliğe bağlı içerik/puan etkilenirdi.
    // Yalnız YABANCI ANAHTAR taşıyan (fields: […]) ilişkiler sayılır; Department/User’daki ters listeler
    // (memberships Membership[]) yabancı anahtar değildir.
    const owningFk = /^\s+\w+\s+Membership\??\s+@relation\([^)]*fields:/m;
    const referencing = Object.entries(models)
      .filter(([name]) => name !== 'Membership')
      .filter(([, body]) => owningFk.test(body) || /\bmembershipId\b/.test(body))
      .map(([name]) => name);
    expect(referencing).toEqual([]);
  });

  it('kimlik tablolarında Cascade silme yoktur (silme/anonimleştirme bilinçli yapılır)', () => {
    for (const name of IDENTITY_MODELS) {
      expect(models[name], name).not.toMatch(/onDelete:\s*Cascade/);
    }
  });

  it('AdminAuditLog yalnız eklenir: updatedAt alanı yoktur', () => {
    expect(models.AdminAuditLog).not.toMatch(/updatedAt/);
  });

  it('kullanıcı tablosunda yetki kararı verilebilecek bir “rol” alanı yoktur', () => {
    expect(models.User).not.toMatch(/^\s+role\s/m);
  });

  it('sınıf saklanmaz (D4): üyelikte yalnız giriş yılı ve düzeltme vardır', () => {
    expect(models.Membership).not.toMatch(/^\s+(grade|classYear|sinif)\w*\s/im);
    expect(models.Membership).toMatch(/entryYear/);
    expect(models.Membership).toMatch(/classOffset/);
  });
});
