import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    // Strictliği delmek yok (docs/engineering.md "Uygulama ilkeleri").
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='console'][callee.property.name='log']",
          message: 'console.log kullanma; kişisel veri ve sır loglanmaz (AGENTS.md §3).',
        },
        ...[
          ['Literal', 'value'],
          ['TemplateElement', 'value.raw'],
        ].flatMap(([node, property]) => [
          {
            selector: `JSXAttribute[name.name="className"] ${node}[${property}=/(^|\\s)text-primary(\\s|$)/][${property}=/(^|\\s)bg-primary-soft(\\s|$)/]`,
            message:
              'text-primary ile bg-primary-soft birlikte kullanılamaz: açık temada kontrast WCAG AA sınırını karşılamaz; text-on-primary-soft kullan.',
          },
          {
            selector: `JSXAttribute[name.name="className"] ${node}[${property}=/(^|\\s)text-primary(\\s|$)/][${property}=/hover:bg-primary-soft(\\s|$)/]:not([${property}=/hover:text-/])`,
            message:
              'text-primary ile hover:bg-primary-soft kontrastı WCAG AA sınırını karşılamaz; hover metin rengini ayrıca belirle.',
          },
        ]),
      ],
    },
  },
  globalIgnores([
    '.next/**',
    'node_modules/**',
    'coverage/**',
    'next-env.d.ts',
    'src/generated/**',
  ]),
]);
