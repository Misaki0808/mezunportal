import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const NATIVE_CHOICE_MESSAGE =
  'Yerli <input type="checkbox|radio"> yazma: tarayıcı gri 13-20 px çizer, koyu temada seçili/seçilmemiş ayrımı zorlaşır ve hesaplanmış stilden ölçülemez. Kit Checkbox / RadioGroup / Radio kullan (src/components/ui).';

// `no-restricted-syntax` seçenekleri bloklar arasında BİRLEŞMEZ, sonraki blok öncekini değiştirir: ortak kurallar tek yerde durur.
const nativeChoiceControls = [
  {
    selector: 'JSXAttribute[name.name="type"] > Literal[value=/^(checkbox|radio)$/]',
    message: NATIVE_CHOICE_MESSAGE,
  },
  {
    selector:
      'JSXAttribute[name.name="type"] > JSXExpressionContainer > Literal[value=/^(checkbox|radio)$/]',
    message: NATIVE_CHOICE_MESSAGE,
  },
];

const restrictedSyntax = [
  {
    selector: "CallExpression[callee.object.name='console'][callee.property.name='log']",
    message: 'console.log kullanma; kişisel veri ve sır loglanmaz (AGENTS.md §3).',
  },
  {
    selector:
      'JSXAttribute[name.name="className"] TemplateLiteral:has(TemplateElement[value.raw=/(^|\\s)text-primary(\\s|$)/]):has(TemplateElement[value.raw=/(^|\\s)bg-primary-soft(\\s|$)/])',
    message:
      'text-primary ile bg-primary-soft birlikte kullanılamaz: açık temada kontrast WCAG AA sınırını karşılamaz; text-on-primary-soft kullan.',
  },
  {
    selector:
      'JSXAttribute[name.name="className"] TemplateLiteral:has(TemplateElement[value.raw=/(^|\\s)text-primary(\\s|$)/]):has(TemplateElement[value.raw=/hover:bg-primary-soft(\\s|$)/]):not(:has(TemplateElement[value.raw=/hover:text-/]))',
    message:
      'text-primary ile hover:bg-primary-soft kontrastı WCAG AA sınırını karşılamaz; hover metin rengini ayrıca belirle.',
  },
  ...[['Literal', 'value']].flatMap(([node, property]) => [
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
];

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    // Strictliği delmek yok (docs/engineering.md "Uygulama ilkeleri").
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      'no-restricted-syntax': ['error', ...restrictedSyntax, ...nativeChoiceControls],
    },
  },
  {
    // Yerli onay kutusu/radyo yasağının istisnaları: kitin kendisi, bileşen galerisi ve testler.
    files: ['src/components/ui/**', 'src/app/ui-ornekleri/**', '**/*.test.{ts,tsx}'],
    rules: { 'no-restricted-syntax': ['error', ...restrictedSyntax] },
  },
  globalIgnores([
    '.next/**',
    'node_modules/**',
    'coverage/**',
    'next-env.d.ts',
    'src/generated/**',
  ]),
]);
