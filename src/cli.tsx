#!/usr/bin/env node

import { ThemeProvider } from '@inkjs/ui';
import { render } from 'ink';
import React from 'react';
import packageJson from '../package.json' with { type: 'json' };
import { App } from './app.js';
import { showBootLogo } from './lib/brand.js';
import { CLI_PACKAGE_NAME } from './lib/constants.js';
import { kleismicTheme } from './lib/theme.js';
import { parseSubcommand, runSubcommand } from './run.js';

type CliFlags = {
	help: boolean;
	version: boolean;
	noLogo: boolean;
};

const GLOBAL_FLAGS = new Set([
	'--help',
	'-h',
	'--version',
	'-v',
	'--no-logo',
	'--json',
]);

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
  kleismic [--no-logo]                   対話モードで起動
  kleismic <command> [args] [--json]     非対話モードで実行
  kleismic --help
  kleismic --version

Commands:
  login <handle> <password>              ログインしてセッションを保存
  logout                                 セッションを削除
  whoami                                 現在のセッション情報を表示
  timeline [room]                        タイムラインを表示 (alias: tl)
  post <id>                              投稿詳細を表示
  user <id|handle>                       ユーザー情報を表示
  compose <text> [--room <room>]         投稿する
  reply <post-id> <text>                 返信する
  love <post-id>                         Love を送る
  boost <post-id>                        Boost を送る
  react <post-id> <text> [--size <n>] [--color <hex>]
                                         リアクションを送る
  delete <post-id>                       投稿を削除する
  notifications                          通知を表示 (alias: notif)

Options:
  --no-logo   起動ロゴを表示しない
  --json      JSON で出力する (非対話モード)
  --help      ヘルプを表示する
  --version   バージョンを表示する
`);
}

const rawArgv = process.argv.slice(2);
const flags = parseFlags(rawArgv);

if (flags.help) {
	printHelp();
	process.exit(0);
}

if (flags.version) {
	console.log(packageJson.version);
	process.exit(0);
}

const subcommandArgv = rawArgv.filter(
	(arg) => !GLOBAL_FLAGS.has(arg) || arg === '--json',
);
const hasSubcommand =
	subcommandArgv.length > 0 &&
	subcommandArgv[0] !== undefined &&
	!subcommandArgv[0].startsWith('-');

if (hasSubcommand) {
	const { command, json } = parseSubcommand(subcommandArgv);

	if (!command) {
		printHelp();
		process.exit(1);
	}

	try {
		await runSubcommand(command, json ? 'json' : 'text');
	} catch (error) {
		const message =
			error instanceof Error ? error.message : '不明なエラーが発生しました';

		if (json) {
			console.error(JSON.stringify({ error: message }));
		} else {
			console.error(`error: ${message}`);
		}

		process.exit(1);
	}

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
