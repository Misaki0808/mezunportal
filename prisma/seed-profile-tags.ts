import type { PrismaClient } from '../src/generated/prisma/client';

/** Pilot için sabit anahtarlar; görünen Türkçe metinler messages/tr.json içindedir. */
export const PROFILE_TAG_SEED = [
  { kind: 'INTEREST', slug: 'software' },
  { kind: 'INTEREST', slug: 'data' },
  { kind: 'INTEREST', slug: 'business' },
  { kind: 'GOAL', slug: 'internship' },
  { kind: 'GOAL', slug: 'career' },
  { kind: 'GOAL', slug: 'network' },
] as const;

export async function seedProfileTags(db: PrismaClient) {
  for (const tag of PROFILE_TAG_SEED) {
    await db.tag.upsert({ where: { kind_slug: tag }, create: tag, update: {} });
  }
}
