import js from '@eslint/js';
import prettier from 'eslint-plugin-prettier/recommended';
import ts_eslint from 'typescript-eslint';

export default ts_eslint.config(
  js.configs.recommended,
  ts_eslint.configs.recommended,
  prettier,
  { ignores: ['**/dist', '**/demo-dist', '**/node_modules', '**/*.d.ts'] },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
    },
    rules: {
      // 添加单引号规则
      quotes: [
        'error',
        'single',
        {
          avoidEscape: true, // 允许在单引号字符串中使用双引号来避免转义
          allowTemplateLiterals: true, // 允许使用模板字符串
        },
      ],
      '@typescript-eslint/no-unused-expressions': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-use-before-define': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-namespace': 'off',
      'spaced-comment': 'error',
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        module: 'readonly',
        require: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
      },
    },
  },
);
