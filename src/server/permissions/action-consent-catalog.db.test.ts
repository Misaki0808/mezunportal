import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createTestPrisma } from '@/test/db';
import {
  addGrant,
  addMembership,
  addMentorProfile,
  createInstitution,
  createUser,
} from '@/test/fixtures';

const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock('../db', () => ({ getDb: () => db }));
vi.mock('./session', () => ({ getSessionUserId: async () => session.userId }));
const db = createTestPrisma();
const imports = import.meta.glob('../actions/*.ts');
const exceptions = new Set([
  'auth.getSignInOptions',
  'auth.startLinkedInSignIn',
  'auth.requestSignInLink',
  'auth.signOut',
  'auth.signInAsTestPersona',
  'auth.declareMembership',
  'auth.listSelectableDepartments',
  'auth.getVerificationState',
  'privacy.getConsentState',
  'privacy.recordConsents',
  'privacy.getFieldVisibility',
  'privacy.setFieldVisibility',
  'privacy.deleteAccount',
]);
const dir = resolve(process.cwd(), 'src/server/actions');
const catalog = readdirSync(dir)
  .filter((file) => file.endsWith('.ts'))
  .flatMap((file) => {
    const source = ts.createSourceFile(
      file,
      readFileSync(resolve(dir, file), 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const server = source.statements.some(
      (node) =>
        ts.isExpressionStatement(node) &&
        ts.isStringLiteral(node.expression) &&
        node.expression.text === 'use server',
    );
    if (!server) return [];
    const actionFile = file.slice(0, -3);
    return source.statements.flatMap((node) => {
      const exported =
        ts.canHaveModifiers(node) &&
        ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      let names: string[] = [];
      if (ts.isFunctionDeclaration(node) && exported && node.name) names = [node.name.text];
      if (ts.isVariableStatement(node) && exported) {
        names = node.declarationList.declarations.map((declaration) => {
          if (!ts.isIdentifier(declaration.name))
            throw new Error(`Eylem kataloğu ayrıştırılamadı: ${file}`);
          return declaration.name.text;
        });
      }
      if (ts.isExportDeclaration(node) || ts.isExportAssignment(node)) {
        throw new Error(`Eylem kataloğu yeniden dışa aktarmayı desteklemiyor: ${file}`);
      }
      return names.map((name) => ({ actionFile, name, key: `${actionFile}.${name}` }));
    });
  });

beforeAll(async () => {
  const institution = await createInstitution(db);
  session.userId = await createUser(db);
  await addMembership(db, {
    userId: session.userId,
    departmentId: institution.deptA1,
    role: 'STUDENT',
    entryYear: 2024,
  });
  await addMentorProfile(db, session.userId);
  await addGrant(db, { userId: session.userId, scope: 'SYSTEM' });
});
afterAll(() => db.$disconnect());

it('istisna listesi yalnız var olan eylemlerden oluşur', () => {
  expect(catalog.length).toBeGreaterThan(100);
  for (const key of exceptions) expect(catalog.map((item) => item.key)).toContain(key);
});
it.each(catalog.filter(({ key }) => !exceptions.has(key)))(
  '$key rıza kapısında durur',
  async ({ actionFile, name }) => {
    const load = imports[`../actions/${actionFile}.ts`];
    expect(load).toBeDefined();
    const actions = (await load!()) as Record<string, (input?: unknown) => Promise<unknown>>;
    expect(await actions[name]!(undefined)).toMatchObject({
      ok: false,
      errorCode: 'CONSENT_REQUIRED',
    });
  },
);
it('kendi onay durumu ve ham kimlik erişilebilir', async () => {
  const actions = await import('../actions/privacy');
  expect(await actions.getConsentState()).toMatchObject({ ok: true, data: { blocking: true } });
  const permissions = await import('./index');
  expect((await permissions.requireUserWithoutConsent()).userId).toBe(session.userId);
});
