import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: { '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }] },
  },
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
    // The scripts run on Node: its globals, declared here instead of pulling in a globals package.
    languageOptions: { globals: { clearTimeout: 'readonly', console: 'readonly', fetch: 'readonly', process: 'readonly', setTimeout: 'readonly', URL: 'readonly' } },
  },
);
