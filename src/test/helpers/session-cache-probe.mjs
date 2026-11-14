import { registerHooks } from 'node:module';
import { Writable } from 'node:stream';
import { pathToFileURL } from 'node:url';

// Yalnız dış bağımlılıklar sahte: gerçek session.ts ve gerçek React sunucu çizicisi çalışır.
const headersModule = `data:text/javascript,${encodeURIComponent('export const headers = async () => globalThis.__cacheTestHeaders()')}`;
const authModule = `data:text/javascript,${encodeURIComponent('export const getAuth = () => ({ api: { getSession: globalThis.__cacheTestSession } })')}`;
const navigationModule = `data:text/javascript,${encodeURIComponent('export const unstable_rethrow = () => {}')}`;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'next/navigation') return { url: navigationModule, shortCircuit: true };
    if (specifier === 'next/headers') return { url: headersModule, shortCircuit: true };
    if (specifier === '../auth' && context.parentURL?.includes('/permissions/session.ts'))
      return { url: authModule, shortCircuit: true };
    return next(specifier, context);
  },
});

const React = await import('react');
const { renderToPipeableStream } =
  await import('next/dist/compiled/react-server-dom-webpack/server.node.js');
let calls = 0;
let userId = 'first-user';
globalThis.__cacheTestHeaders = () => new Headers({ cookie: 'mezun.session_token=synthetic' });
globalThis.__cacheTestSession = async () => {
  calls += 1;
  return { user: { id: userId } };
};
const { getSessionUserId } = await import(
  pathToFileURL(`${process.cwd()}/src/server/permissions/session.ts`).href
);
async function Page() {
  const values = await Promise.all([getSessionUserId(), getSessionUserId(), getSessionUserId()]);
  return React.createElement('p', null, values.join(','));
}
const measurements = [];
for (const id of ['first-user', 'second-user']) {
  userId = id;
  let outputText = '';
  const output = new Writable({
    write(chunk, _encoding, done) {
      outputText += chunk;
      done();
    },
  });
  renderToPipeableStream(React.createElement(Page), {}).pipe(output);
  await new Promise((resolve, reject) => {
    output.once('finish', resolve);
    output.once('error', reject);
  });
  measurements.push({ id, calls, correctUser: outputText.includes(`${id},${id},${id}`) });
}
process.stdout.write(JSON.stringify(measurements));
