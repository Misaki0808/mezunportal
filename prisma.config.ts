import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Prisma 7 `.env` dosyalarını kendiliğinden yüklemez. Yerel ayar Git dışı `.env.local`'dadır
// (worktree başına veritabanı adresi); CI ve canlıda değişkenler ortamdan gelir.
if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // `prisma generate` adres istemez; migrate/seed için DATABASE_URL zorunludur.
    url: process.env.DATABASE_URL ?? '',
  },
});
