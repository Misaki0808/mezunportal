import { describe, expect, it } from 'vitest';

import { isAllowedAuthRoute } from './authRoutePolicy';

describe('isAllowedAuthRoute (Better Auth HTTP beyaz listesi)', () => {
  it.each([
    ['/api/auth/magic-link/verify', 'GET'],
    ['/api/auth/verify-email', 'GET'],
    ['/api/auth/callback/linkedin', 'GET'],
    ['/api/auth/magic-link/verify/', 'get'],
  ])('%s %s açık', (path, method) => {
    expect(isAllowedAuthRoute(path, method)).toBe(true);
  });

  it.each([
    // admin eklentisi: yönetim ve “başka kullanıcı gibi giriş”
    ['/api/auth/admin/impersonate-user', 'POST'],
    ['/api/auth/admin/stop-impersonating', 'POST'],
    ['/api/auth/admin/set-role', 'POST'],
    ['/api/auth/admin/remove-user', 'POST'],
    ['/api/auth/admin/ban-user', 'POST'],
    ['/api/auth/admin/list-users', 'GET'],
    ['/api/auth/admin/create-user', 'POST'],
    // doğrudan giriş/kayıt/parola uçları (hız sınırımızı ve nötr yanıtımızı atlar)
    ['/api/auth/sign-in/magic-link', 'POST'],
    ['/api/auth/sign-in/social', 'POST'],
    ['/api/auth/sign-in/email', 'POST'],
    ['/api/auth/sign-up/email', 'POST'],
    ['/api/auth/change-password', 'POST'],
    ['/api/auth/reset-password', 'POST'],
    ['/api/auth/change-email', 'POST'],
    ['/api/auth/delete-user', 'POST'],
    ['/api/auth/list-sessions', 'GET'],
    ['/api/auth/revoke-sessions', 'POST'],
    ['/api/auth/get-session', 'GET'],
    ['/api/auth/sign-out', 'POST'],
    ['/api/auth/test-login', 'POST'],
    ['/api/auth/ok', 'GET'],
    ['/api/auth/reference', 'GET'],
    ['/api/auth/callback/github', 'GET'],
    ['/api/auth', 'GET'],
    ['/api/auth/', 'GET'],
    // doğru yol, yanlış yöntem
    ['/api/auth/magic-link/verify', 'POST'],
    ['/api/auth/callback/linkedin', 'POST'],
    ['/api/auth/verify-email', 'DELETE'],
    // yol hilesi
    ['/api/auth/magic-link/verify/../admin/impersonate-user', 'GET'],
    ['/api/auth//magic-link/verify', 'GET'],
    ['/api/auth/magic-link/verifyx', 'GET'],
    ['/api/authx/magic-link/verify', 'GET'],
  ])('%s %s kapalı', (path, method) => {
    expect(isAllowedAuthRoute(path, method)).toBe(false);
  });
});
