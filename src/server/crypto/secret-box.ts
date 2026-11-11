import 'server-only';

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Sır kutusu: veritabanında saklanan üçüncü taraf jetonlarını (Google yenileme jetonu) AES-256-GCM ile şifreler. Anahtar ayrı bir
 * sır değildir: mevcut sunucu sırrından (`BETTER_AUTH_SECRET`) HKDF ile, amaca özel bağlamla türetilir (anahtar yönetimi eklememek
 * için kullanıcı kararı). Her şifrelemede yeni rastgele IV; kimlik doğrulama etiketi bütünlüğü korur; "bağlam" (AAD) şifreli veriyi
 * amacına bağlar (başka bir alana kopyalanan şifreli değer çözülmez).
 *
 * Biçim: `v1.<iv>.<etiket>.<şifreli>` (base64url). Düz metin hiçbir yere yazılmaz; hata mesajları değer içermez.
 * Sır değişirse eski şifreli değerler çözülemez (`SecretBoxError`): bağlantı yeniden kurulmalıdır (docs/engineering.md).
 */
const VERSION = 'v1';
const KEY_INFO = 'mezunportal:secret-box:v1';
const IV_BYTES = 12;
const KEY_BYTES = 32;
const SALT = Buffer.from('mezunportal.secret-box.salt');

export class SecretBoxError extends Error {
  constructor() {
    super('SECRET_BOX_UNREADABLE');
    this.name = 'SecretBoxError';
  }
}

function deriveKey(secret: string): Buffer {
  if (secret.length < 32) throw new SecretBoxError();
  return Buffer.from(hkdfSync('sha256', secret, SALT, KEY_INFO, KEY_BYTES));
}

export function encryptSecret(plaintext: string, secret: string, context: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv);
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, body]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
    .join('.');
}

export function decryptSecret(stored: string, secret: string, context: string): string {
  try {
    const [version, ivText, tagText, bodyText, ...rest] = stored.split('.');
    if (version !== VERSION || !ivText || !tagText || !bodyText || rest.length > 0)
      throw new SecretBoxError();
    const iv = Buffer.from(ivText, 'base64url');
    const tag = Buffer.from(tagText, 'base64url');
    if (iv.length !== IV_BYTES || tag.length !== 16) throw new SecretBoxError();
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret), iv);
    decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(Buffer.from(bodyText, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // Ayrıntı (hangi adımın başarısız olduğu, değerin kendisi) dışarı verilmez.
    throw new SecretBoxError();
  }
}
