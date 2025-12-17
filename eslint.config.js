import js from '@eslint/js';
import reactThree from '@react-three/eslint-plugin';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettier from 'eslint-plugin-prettier/recommended';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import ts_eslint from 'typescript-eslint';

export default ts_eslint.config(
  js.configs.recommended,
  ts_eslint.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],
  jsxA11y.flatConfigs.recommended,
  prettier,
  // unocss,
  { ignores: ['**/*/.react-router', '**/*/public'] },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-three': reactThree.configs.recommended,
    },
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
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
      'react/self-closing-comp': 'error',
      'react/prop-types': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': [
        'warn',
        { additionalHooks: '(^useForm$|^useDebounce$|^useLoadingRequest$|^useStateRequest$)' },
      ],
      'react/no-unknown-property': 'off',
      '@typescript-eslint/no-unused-expressions': 'error',
      'react/display-name': 'off',
      'jsx-a11y/click-events-have-key-events': 'off',
      'jsx-a11y/no-static-element-interactions': 'off',
      'jsx-a11y/no-autofocus': 'off',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-use-before-define': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-namespace': 'off',
      'spaced-comment': 'error',
    },
    settings: {
      react: {
        version: 'detect',
      },
      formComponents: ['Form'],
      linkComponents: [
        { name: 'Link', linkAttribute: 'to' },
        { name: 'NavLink', linkAttribute: 'to' },
      ],
      'import/resolver': {
        typescript: {},
      },
      // unocss: {
      //   configPath: './packages/design/uno.config.ts',
      // },
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
