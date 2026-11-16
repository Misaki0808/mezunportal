import 'server-only';
import sharp from 'sharp';
import {
  PROFILE_PHOTO_MAX_BYTES,
  PROFILE_PHOTO_MAX_PIXELS,
  type PhotoCrop,
} from '@/contracts/profile-photo';
import { codedValidation, codedConflict } from '@/lib/errors';

sharp.concurrency(1);
sharp.cache(false);
let processing = false;

/** MIME/uzantı güvenilmez; yalnız desteklenen dosya imzaları çözülür. */
export function sniffPhoto(bytes: Uint8Array): 'jpeg' | 'png' | 'webp' | null {
  const b = Buffer.from(bytes);
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function animated(bytes: Buffer, format: string) {
  if (format === 'jpeg') {
    let offset = 2;
    while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
      // JPEG dolgu FF baytları ve uzunluksuz TEM/RST işaretleri MPF denetimini atlatamaz.
      while (offset + 4 <= bytes.length && bytes[offset + 1] === 0xff) offset++;
      if (offset + 4 > bytes.length) break;
      const marker = bytes[offset + 1];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker !== undefined && marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      if (marker === 0xd8) return true;
      const length = bytes.readUInt16BE(offset + 2);
      if (length < 2) break;
      if (marker === 0xe2 && bytes.toString('ascii', offset + 4, offset + 8) === 'MPF\0')
        return true;
      offset += length + 2;
    }
  }
  // APNG acTL ve WebP ANIM gerçek parça sınırlarından okunur (piksel verisinde tesadüfi eşleşme yok).
  let offset = format === 'png' ? 8 : 12;
  while (offset + 8 <= bytes.length && (format === 'png' || format === 'webp')) {
    const length = format === 'png' ? bytes.readUInt32BE(offset) : bytes.readUInt32LE(offset + 4);
    const kind = bytes.toString(
      'ascii',
      offset + (format === 'png' ? 4 : 0),
      offset + (format === 'png' ? 8 : 4),
    );
    if (kind === 'acTL' || kind === 'ANIM') return true;
    offset += format === 'png' ? length + 12 : 8 + length + (length % 2);
  }
  return false;
}

/** Aynı süreçte tek çözme; kuyrukta sınırsız ham dosya tutulmaz. Hiçbir metadata/orijinal saklanmaz. */
export async function processProfilePhoto(bytes: Uint8Array, crop: PhotoCrop) {
  if (!bytes.length || bytes.length > PROFILE_PHOTO_MAX_BYTES)
    throw codedValidation('PHOTO_TOO_LARGE');
  const format = sniffPhoto(bytes);
  if (!format || animated(Buffer.from(bytes), format)) throw codedValidation('PHOTO_INVALID');
  if (processing) throw codedConflict('RESOURCE_CONFLICT');
  processing = true;
  try {
    const options = { limitInputPixels: PROFILE_PHOTO_MAX_PIXELS, failOn: 'warning' as const };
    const metadata = await sharp(bytes, options).metadata();
    if (
      metadata.format !== format ||
      (metadata.pages ?? 1) > 1 ||
      !metadata.width ||
      !metadata.height
    )
      throw codedValidation('PHOTO_INVALID');
    const swap = (metadata.orientation ?? 1) >= 5;
    const width = swap ? metadata.height : metadata.width;
    const height = swap ? metadata.width : metadata.height;
    const side = Math.max(1, Math.floor(Math.min(width, height) / crop.zoom));
    const base = await sharp(bytes, options)
      .timeout({ seconds: 5 })
      .autoOrient()
      .extract({
        left: Math.floor((width - side) * crop.x),
        top: Math.floor((height - side) * crop.y),
        width: side,
        height: side,
      })
      .resize(512, 512)
      .webp({ quality: 85 })
      .toBuffer();
    const small = await sharp(base, options)
      .timeout({ seconds: 5 })
      .resize(96, 96)
      .webp({ quality: 80 })
      .toBuffer();
    return { large: new Uint8Array(base), small: new Uint8Array(small) };
  } catch {
    throw codedValidation('PHOTO_INVALID');
  } finally {
    processing = false;
  }
}
