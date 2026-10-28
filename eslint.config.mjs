import next from 'eslint-config-next';

const config = [
  ...next,
  {
    rules: {
      // الصور من Supabase Storage مباشرة (بدون محسّن Next) لتقليل التكلفة
      '@next/next/no-img-element': 'off',
    },
  },
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'] },
];

export default config;
