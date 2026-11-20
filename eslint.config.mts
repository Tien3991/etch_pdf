import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'docs',
		// Hidden folders hold local artifacts (test vault internals, tooling
		// state), never lint targets.
		'**/.*/**',
		'esbuild.config.mjs',
		'version-bump.mjs',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		rules: {
			// UI copy names Apple products (Apple Pencil, Apple Preview) and
			// the Verify last handoff command, so these words are capitalized
			// mid-sentence on purpose, as is Xodo, an app's name used as an
			// example. The steps for making a shortcut quote
			// action names from the Shortcuts app, which keep the capitals
			// that app gives them, so those steps are matched as a whole.
			'obsidianmd/ui/sentence-case': [
				'warn',
				{
					ignoreWords: ['Apple', 'Pencil', 'Preview', 'Verify', 'Xodo'],
					ignoreRegex: ['^Add the action "'],
				},
			],
		},
	},
);
