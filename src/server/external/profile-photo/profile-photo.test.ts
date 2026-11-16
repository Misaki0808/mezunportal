import sharp from 'sharp';
import { describe, it, expect } from 'vitest';
import { PROFILE_PHOTO_MAX_BYTES } from '@/contracts/profile-photo';
import { processProfilePhoto, sniffPhoto } from './index';
const crop = { x: 0.5, y: 0.5, zoom: 1 };
const image = () =>
  sharp({ create: { width: 100, height: 200, channels: 3, background: '#a32b68' } });

describe('güvenli profil fotoğrafı çözme', () => {
  it('başka yükleme işlenirken kararlı, yeniden denemeye yönlendiren kod döner', async () => {
    const bytes = await image().png().toBuffer();
    const first = processProfilePhoto(bytes, crop);
    try {
      await expect(processProfilePhoto(bytes, crop)).rejects.toMatchObject({
        code: 'PHOTO_PROCESSING_BUSY',
      });
    } finally {
      await first;
    }
    await expect(processProfilePhoto(bytes, crop)).resolves.toHaveProperty('large');
  });
  it.each(['jpeg', 'png', 'webp'] as const)(
    '%s baytını tanır ve yalnız 512/96 WebP üretir',
    async (format) => {
      const input = await image().toFormat(format).toBuffer();
      expect(sniffPhoto(input)).toBe(format);
      const output = await processProfilePhoto(input, crop);
      expect(await sharp(output.large).metadata()).toMatchObject({
        format: 'webp',
        width: 512,
        height: 512,
      });
      expect(await sharp(output.small).metadata()).toMatchObject({
        format: 'webp',
        width: 96,
        height: 96,
      });
    },
  );
  it('ad/uzantı/MIME yerine gerçek içerik: PDF, SVG, GIF, yalancı JPEG ve bozuk dosya reddedilir', async () => {
    for (const bytes of [
      Buffer.from('%PDF-1.7'),
      Buffer.from('<svg/>'),
      Buffer.from('GIF89a'),
      Buffer.from([255, 216, 255, 0]),
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    ]) {
      await expect(processProfilePhoto(bytes, crop)).rejects.toMatchObject({
        code: 'PHOTO_INVALID',
      });
    }
  });
  it.each(['gif', 'tiff', 'avif', 'svg'] as const)(
    'sharp çözebilse de JPEG/PNG/WebP dışı %s biçimini reddeder',
    async (format) => {
      const bytes =
        format === 'svg'
          ? Buffer.from(
              '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#a32b68"/></svg>',
            )
          : await sharp({
              create: { width: 64, height: 64, channels: 3, background: '#a32b68' },
            })
              .toFormat(format)
              .toBuffer();
      // Bozuk dosya sharp tarafından da reddedilir; bu örnekler gerçekten çözülebilmelidir.
      const decoded = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
      expect(decoded.info).toMatchObject({ width: 64, height: 64 });
      await expect(processProfilePhoto(bytes, crop)).rejects.toMatchObject({
        code: 'PHOTO_INVALID',
      });
    },
  );
  it('5 MB üstünü ve boş dosyayı çözmeden reddeder', async () => {
    await expect(
      processProfilePhoto(new Uint8Array(PROFILE_PHOTO_MAX_BYTES + 1), crop),
    ).rejects.toMatchObject({ code: 'PHOTO_TOO_LARGE' });
    await expect(processProfilePhoto(new Uint8Array(), crop)).rejects.toMatchObject({
      code: 'PHOTO_INVALID',
    });
  });
  it('EXIF, GPS, XMP ve yön verisi türevlerde yoktur', async () => {
    const bytes = await image()
      .withExif({
        IFD0: { Artist: 'Synthetic', Orientation: '6' },
        IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '41/1 0/1 0/1' },
      })
      .jpeg()
      .toBuffer();
    expect((await sharp(bytes).metadata()).exif).toBeDefined();
    const output = await processProfilePhoto(bytes, crop);
    for (const bytes of [output.large, output.small]) {
      const metadata = await sharp(bytes).metadata();
      expect(metadata.exif).toBeUndefined();
      expect(metadata.xmp).toBeUndefined();
      expect(metadata.orientation).toBeUndefined();
      expect(metadata.icc).toBeUndefined();
    }
  });
  it('EXIF yönü 6 gerçekten uygulanır: görünen üst kırmızı, alt mavi kırpılır', async () => {
    const bytes = await sharp({
      create: { width: 200, height: 100, channels: 3, background: 'red' },
    })
      .composite([
        {
          input: await sharp({
            create: { width: 100, height: 100, channels: 3, background: 'blue' },
          })
            .png()
            .toBuffer(),
          left: 100,
          top: 0,
        },
      ])
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    expect(await sharp(bytes).metadata()).toMatchObject({
      width: 200,
      height: 100,
      orientation: 6,
    });
    const top = await processProfilePhoto(bytes, { x: 0.5, y: 0, zoom: 1 });
    const bottom = await processProfilePhoto(bytes, { x: 0.5, y: 1, zoom: 1 });
    for (const size of ['large', 'small'] as const) {
      const topStats = await sharp(top[size]).stats();
      const bottomStats = await sharp(bottom[size]).stats();
      expect(topStats.channels[0]!.mean).toBeGreaterThan(240);
      expect(topStats.channels[2]!.mean).toBeLessThan(15);
      expect(bottomStats.channels[2]!.mean).toBeGreaterThan(240);
      expect(bottomStats.channels[0]!.mean).toBeLessThan(15);
    }
  });
  it('24 MP üstü çözme bütçesini aşamaz', async () => {
    const bytes = await sharp({
      create: { width: 6000, height: 4001, channels: 3, background: 'red' },
    })
      .png()
      .toBuffer();
    await expect(processProfilePhoto(bytes, crop)).rejects.toMatchObject({ code: 'PHOTO_INVALID' });
  });
  it('çok kareli WebP reddedilir; ardından tek kare işlenebilir', async () => {
    const a = Buffer.alloc(300);
    for (let i = 0; i < a.length; i += 3) a[i] = 255;
    const b = Buffer.alloc(300);
    for (let i = 2; i < b.length; i += 3) b[i] = 255;
    const bytes = await sharp(Buffer.concat([a, b]), {
      raw: { width: 10, height: 20, channels: 3, pageHeight: 10 },
    })
      .webp({ loop: 0, delay: [100, 100] })
      .toBuffer();
    const metadata = await sharp(bytes).metadata();
    expect(metadata.pages).toBe(2);
    await expect(processProfilePhoto(bytes, crop)).rejects.toMatchObject({ code: 'PHOTO_INVALID' });
    await expect(processProfilePhoto(await image().png().toBuffer(), crop)).resolves.toHaveProperty(
      'large',
    );
  });
  it('aynı anda iki çözme yerine ikinciye kararlı çakışma döner', async () => {
    const bytes = await image().png().toBuffer();
    const first = processProfilePhoto(bytes, crop);
    await expect(processProfilePhoto(bytes, crop)).rejects.toMatchObject({
      code: 'RESOURCE_CONFLICT',
    });
    await first;
  });
  it('kare kırpma seçilen bölgeyi gerçekten değiştirir', async () => {
    const bytes = await sharp({
      create: { width: 100, height: 50, channels: 3, background: 'red' },
    })
      .composite([
        {
          input: await sharp({ create: { width: 50, height: 50, channels: 3, background: 'blue' } })
            .png()
            .toBuffer(),
          left: 50,
          top: 0,
        },
      ])
      .png()
      .toBuffer();
    const left = await processProfilePhoto(bytes, { x: 0, y: 0, zoom: 1 });
    const right = await processProfilePhoto(bytes, { x: 1, y: 0, zoom: 1 });
    const a = await sharp(left.small).stats();
    const b = await sharp(right.small).stats();
    expect(a.channels[0]!.mean).toBeGreaterThan(a.channels[2]!.mean);
    expect(b.channels[2]!.mean).toBeGreaterThan(b.channels[0]!.mean);
  });
});
it('JPEG dolgu baytı MPF çoklu fotoğraf reddini atlatamaz', async () => {
  const jpeg = await image().jpeg().toBuffer();
  const mpo = Buffer.concat([
    jpeg.subarray(0, 2),
    Buffer.from([255, 255, 226, 0, 6, 77, 80, 70, 0]),
    jpeg.subarray(2),
  ]);
  await expect(processProfilePhoto(mpo, crop)).rejects.toMatchObject({ code: 'PHOTO_INVALID' });
});
