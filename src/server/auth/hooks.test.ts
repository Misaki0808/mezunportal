import { describe, expect, it } from 'vitest';

import {
  accountTokensStripped,
  nameFromEmail,
  sanitizeAuthLog,
  sessionCreateBefore,
  userCreateBefore,
} from './hooks';

describe('nameFromEmail', () => {
  it.each([
    ['ayse.yilmaz@ogr.iu.edu.tr', 'ayse yilmaz'],
    ['mert_k+etiket@gmail.com', 'mert k etiket'],
    ['a@b.co', 'a'],
    ['...@b.co', 'Üye'],
    ['@b.co', 'Üye'],
    ['x'.repeat(200) + '@b.co', 'x'.repeat(80)],
  ])('%s → %j', (email, name) => {
    expect(nameFromEmail(email)).toBe(name);
  });
});

describe('userCreateBefore', () => {
  it('boş adı e-postadan türetir, e-postayı küçültür ve kırpar', () => {
    const { data } = userCreateBefore({
      email: '  Ayse.Yilmaz@Example.COM ',
      name: '',
      emailVerified: true,
    });
    expect(data).toMatchObject({
      email: 'ayse.yilmaz@example.com',
      name: 'ayse yilmaz',
      emailVerified: true,
    });
  });

  it('verilen adı korur (kırpar)', () => {
    expect(userCreateBefore({ email: 'a@b.co', name: '  Ayşe Yılmaz ' }).data.name).toBe(
      'Ayşe Yılmaz',
    );
  });
});

describe('sessionCreateBefore (KVKK veri en azlığı)', () => {
  it('IP ve user-agent’ı saklamaz, diğer alanları korur', () => {
    const { data } = sessionCreateBefore({
      userId: 'u1',
      token: 't',
      ipAddress: '203.0.113.7',
      userAgent: 'Mozilla/5.0',
    });
    expect(data).toMatchObject({ userId: 'u1', token: 't', ipAddress: null, userAgent: null });
  });
});

describe('accountTokensStripped (LinkedIn jetonları saklanmaz)', () => {
  it('erişim/yenileme/kimlik jetonlarını ve parolayı siler; kimlik alanlarını korur', () => {
    const { data } = accountTokensStripped({
      providerId: 'linkedin',
      accountId: 'abc',
      userId: 'u1',
      accessToken: 'gizli-erisim',
      refreshToken: 'gizli-yenileme',
      idToken: 'gizli-kimlik',
      accessTokenExpiresAt: new Date(),
      refreshTokenExpiresAt: new Date(),
      password: 'x',
      scope: 'openid,profile,email',
    });
    expect(data).toMatchObject({
      providerId: 'linkedin',
      accountId: 'abc',
      userId: 'u1',
      scope: 'openid,profile,email',
      accessToken: null,
      refreshToken: null,
      idToken: null,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
      password: null,
    });
    expect(JSON.stringify(data)).not.toContain('gizli');
  });
});

describe('sanitizeAuthLog', () => {
  it.each([
    ['hata ayse@ogr.iu.edu.tr için', 'hata [e-posta] için'],
    [
      'bağlantı http://localhost:3000/api/auth/magic-link/verify?token=abc açılamadı',
      'bağlantı [bağlantı] açılamadı',
    ],
    ['token=gizli123 geçersiz', 'token=[gizli] geçersiz'],
    ['state=xyz code=abc', 'state=[gizli] code=[gizli]'],
  ])('%j → %j', (input, expected) => {
    expect(sanitizeAuthLog(input)).toBe(expected);
  });

  it('uzun iletiyi keser', () => {
    expect(sanitizeAuthLog('x'.repeat(1000)).length).toBe(300);
  });
});
