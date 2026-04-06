#!/usr/bin/env node

import { ThemeProvider } from '@inkjs/ui';
import { render } from 'ink';
import React from 'react';
import packageJson from '../package.json' with { type: 'json' };
import { App } from './app.js';
import { showBootLogo } from './lib/brand.js';
import { CLI_PACKAGE_NAME } from './lib/constants.js';
import { kleismicTheme } from './lib/theme.js';

type CliFlags = {
	help: boolean;
	version: boolean;
	noLogo: boolean;
};

function parseFlags(argv: string[]): CliFlags {
	return {
		help: argv.includes('--help') || argv.includes('-h'),
		version: argv.includes('--version') || argv.includes('-v'),
		noLogo: argv.includes('--no-logo'),
	};
}

function printHelp() {
	console.log(`${CLI_PACKAGE_NAME}

Usage:
  kleismic [--no-logo]
  kleismic --help
  kleismic --version

Options:
  --no-logo   起動ロゴを表示しない
  --help      ヘルプを表示する
  --version   バージョンを表示する
`);
}

const flags = parseFlags(process.argv.slice(2));

if (flags.help) {
	printHelp();
	process.exit(0);
}

if (flags.version) {
	console.log(packageJson.version);
	process.exit(0);
}

if (!process.stdin.isTTY) {
	console.error(
		'Interactive mode requires a TTY. Run `kleismic` in a real terminal, or use `--help` / `--version`.',
	);
	process.exit(1);
}

await showBootLogo({ enabled: !flags.noLogo });

render(
	<ThemeProvider theme={kleismicTheme}>
		<App />
	</ThemeProvider>,
);
