// https://docs.expo.dev/guides/using-eslint/
const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const reactNative = require('eslint-plugin-react-native');

// Colors must come from the theme (src/theme/palettes.ts) so the app can be re-themed
// by editing one file. These rules flag color values written anywhere else.
const COLOR_LITERAL = /^(#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|(rgb|rgba|hsl|hsla)\()/;

module.exports = defineConfig([
  globalIgnores(['dist/*', '.expo/*']),
  expoConfig,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-native': reactNative },
    rules: {
      'react-native/no-color-literals': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: `Literal[value=${COLOR_LITERAL}]`,
          message: 'Use a theme color (theme.colors.*) instead of a color literal.',
        },
      ],
    },
  },
  {
    // The palette is where colors are defined.
    files: ['src/theme/palettes.ts'],
    rules: { 'no-restricted-syntax': 'off', 'react-native/no-color-literals': 'off' },
  },
]);
