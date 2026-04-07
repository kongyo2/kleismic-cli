import { KleismicClient } from './lib/api.js';
import { BRAND, DEFAULT_ROOM } from './lib/constants.js';
import { clearSession, loadSession, saveSession } from './lib/session.js';
import { BASE_URL } from './lib/constants.js';
import { buildTypingFrames } from './lib/history.js';

type OutputMode = 'text' | 'json';

function output(data: unknown, mode: OutputMode) {
	if (mode === 'json') {
		console.log(JSON.stringify(data, null, 2));
		return;
	}

	if (typeof data === 'string') {
		console.log(data);
		return;
	}

	console.log(JSON.stringify(data, null, 2));
}

function fail(message: string, mode: OutputMode): never {
	if (mode === 'json') {
		console.error(JSON.stringify({ error: message }));
	} else {
		console.error(`error: ${message}`);
	}

	process.exit(1);
}

async function restoreClient() {
	const client = new KleismicClient();
	const stored = await loadSession();

	if (stored) {
		client.setCookies(stored.cookies);
	}

	return { client, hasSession: Boolean(stored) };
}

async function requireSession(mode: OutputMode) {
	const { client, hasSession } = await restoreClient();

	if (!hasSession) {
		fail(
			'ログインが必要です。先に `kleismic login` を実行してください。',
			mode,
		);
	}

	const user = await client.getMe().catch(() => null);

	if (!user) {
		fail(
			'セッションが無効です。`kleismic login` で再ログインしてください。',
			mode,
		);
	}

	return { client, user };
}

export type Subcommand =
	| { name: 'login'; handle: string; password: string }
	| { name: 'logout' }
	| { name: 'whoami' }
	| { name: 'timeline'; room: string }
	| { name: 'post'; postId: number }
	| { name: 'user'; query: string }
	| { name: 'compose'; text: string; room: string }
	| { name: 'reply'; postId: number; text: string }
	| { name: 'love'; postId: number }
	| { name: 'boost'; postId: number }
	| {
			name: 'react';
			postId: number;
			text: string;
			size: number;
			color: string;
	  }
	| { name: 'delete'; postId: number }
	| { name: 'notifications' };

export async function runSubcommand(cmd: Subcommand, mode: OutputMode) {
	if (cmd.name === 'login') {
		const client = new KleismicClient();
		const user = await client.login(cmd.handle, cmd.password);
		await saveSession({
			baseUrl: BASE_URL,
			savedAt: new Date().toISOString(),
			cookies: client.getCookies(),
			lastUser: {
				id: user.id,
				handleName: user.handleName,
				displayName: user.displayName,
			},
		});

		if (mode === 'json') {
			output(
				{
					ok: true,
					user: {
						id: user.id,
						handleName: user.handleName,
						displayName: user.displayName,
					},
				},
				mode,
			);
		} else {
			output(
				`${user.displayName || user.handleName} としてログインしました (id: ${user.id})`,
				mode,
			);
		}

		return;
	}

	if (cmd.name === 'logout') {
		await clearSession();

		if (mode === 'json') {
			output({ ok: true }, mode);
		} else {
			output('セッションを削除しました。', mode);
		}

		return;
	}

	if (cmd.name === 'whoami') {
		const { client, hasSession } = await restoreClient();

		if (!hasSession) {
			if (mode === 'json') {
				output({ loggedIn: false }, mode);
			} else {
				output('ログインしていません。', mode);
			}

			return;
		}

		const user = await client.getMe().catch(() => null);

		if (!user) {
			if (mode === 'json') {
				output({ loggedIn: false, sessionExpired: true }, mode);
			} else {
				output('セッションが期限切れです。再ログインしてください。', mode);
			}

			return;
		}

		if (mode === 'json') {
			output(
				{
					loggedIn: true,
					user: {
						id: user.id,
						handleName: user.handleName,
						displayName: user.displayName,
						posts: user.posts,
						followers: user.followers,
						followees: user.followees,
						ampoule: user.ampoule,
					},
				},
				mode,
			);
		} else {
			output(
				[
					`${user.displayName || user.handleName} (@${user.handleName})`,
					`  id: ${user.id}`,
					`  posts: ${user.posts}  followers: ${user.followers}  followees: ${user.followees}`,
					`  ampoule: ${user.ampoule.toFixed(1)}`,
				].join('\n'),
				mode,
			);
		}

		return;
	}

	if (cmd.name === 'timeline') {
		const { client } = await restoreClient();
		const posts = await client.getTimeline(cmd.room);

		if (mode === 'json') {
			output({ room: cmd.room, count: posts.length, posts }, mode);
			return;
		}

		if (posts.length === 0) {
			output('投稿が見つかりませんでした。', mode);
			return;
		}

		const lines = posts.map((post) => {
			const content = (post.content || '(empty)')
				.replace(/\s+/g, ' ')
				.trim()
				.slice(0, 60);
			return `${post.id} (#${post.shortId})  user#${post.authorId}  ${content}`;
		});

		output(
			[`timeline / ${cmd.room} (${posts.length} posts)`, '', ...lines].join(
				'\n',
			),
			mode,
		);
		return;
	}

	if (cmd.name === 'post') {
		const { client } = await restoreClient();
		const post = await client.getPost(cmd.postId);
		const author = await client.getUserById(post.authorId).catch(() => null);

		if (mode === 'json') {
			output({ post, author }, mode);
			return;
		}

		const authorLabel = author
			? `${author.displayName || author.handleName} (@${author.handleName})`
			: `user#${post.authorId}`;

		output(
			[
				`#${post.shortId} by ${authorLabel}`,
				`  date: ${post.date}`,
				`  love: ${post.likes}  boost: ${post.boosts}  reply: ${post.replyCount}`,
				`  reactions: ${post.reactions.length}`,
				`  typing frames: ${buildTypingFrames(post.history).length}`,
				'',
				post.content || '(empty)',
			].join('\n'),
			mode,
		);
		return;
	}

	if (cmd.name === 'user') {
		const { client } = await restoreClient();
		let user;

		if (/^\d+$/.test(cmd.query.trim())) {
			user = await client.getUserById(Number(cmd.query.trim()));
		} else {
			user = await client.getUserByHandle(cmd.query.trim());
		}

		if (!user) {
			fail('ユーザーが見つかりませんでした。', mode);
		}

		if (mode === 'json') {
			output({ user }, mode);
			return;
		}

		output(
			[
				`${user.displayName || user.handleName} (@${user.handleName})`,
				`  id: ${user.id}`,
				`  bio: ${user.bio || '(empty)'}`,
				`  posts: ${user.posts}  followers: ${user.followers}  followees: ${user.followees}`,
				`  ampoule: ${user.ampoule.toFixed(1)}`,
			].join('\n'),
			mode,
		);
		return;
	}

	if (cmd.name === 'compose') {
		const { client } = await requireSession(mode);
		await client.sendPost(cmd.text, cmd.room);

		if (mode === 'json') {
			output({ ok: true, room: cmd.room }, mode);
		} else {
			output(
				`${cmd.room === DEFAULT_ROOM ? 'index' : cmd.room} に投稿しました。`,
				mode,
			);
		}

		return;
	}

	if (cmd.name === 'reply') {
		const { client } = await requireSession(mode);
		await client.replyPost(cmd.postId, cmd.text);

		if (mode === 'json') {
			output({ ok: true, postId: cmd.postId }, mode);
		} else {
			output(`#${cmd.postId} へ返信しました。`, mode);
		}

		return;
	}

	if (cmd.name === 'love') {
		const { client } = await requireSession(mode);
		await client.love(cmd.postId);

		if (mode === 'json') {
			output({ ok: true, postId: cmd.postId }, mode);
		} else {
			output(`#${cmd.postId} に Love を送りました。`, mode);
		}

		return;
	}

	if (cmd.name === 'boost') {
		const { client } = await requireSession(mode);
		await client.boost(cmd.postId);

		if (mode === 'json') {
			output({ ok: true, postId: cmd.postId }, mode);
		} else {
			output(`#${cmd.postId} に Boost を送りました。`, mode);
		}

		return;
	}

	if (cmd.name === 'react') {
		const { client } = await requireSession(mode);
		await client.reaction(cmd.postId, cmd.text, cmd.size, cmd.color);

		if (mode === 'json') {
			output(
				{
					ok: true,
					postId: cmd.postId,
					text: cmd.text,
					size: cmd.size,
					color: cmd.color,
				},
				mode,
			);
		} else {
			output(
				`#${cmd.postId} にリアクション "${cmd.text}" を送りました。`,
				mode,
			);
		}

		return;
	}

	if (cmd.name === 'delete') {
		const { client } = await requireSession(mode);
		await client.deletePost(cmd.postId);

		if (mode === 'json') {
			output({ ok: true, postId: cmd.postId }, mode);
		} else {
			output(`#${cmd.postId} を削除しました。`, mode);
		}

		return;
	}

	if (cmd.name === 'notifications') {
		const { client } = await requireSession(mode);
		const notifications = await client.getNotifications();
		const unreadCount = notifications.filter((n) => n.state === 0).length;

		if (mode === 'json') {
			output(
				{
					total: notifications.length,
					unread: unreadCount,
					notifications,
				},
				mode,
			);
			return;
		}

		if (notifications.length === 0) {
			output('通知はありません。', mode);
			return;
		}

		const lines = notifications.map((entry) => {
			const prefix = entry.state === 0 ? '[unread]' : '[read]';
			const body = (entry.message || entry.type || 'notification')
				.replace(/\s+/g, ' ')
				.trim()
				.slice(0, 60);
			return `${prefix} ${entry.type || 'notify'}  ${body}`;
		});

		output(
			[
				`notifications (total: ${notifications.length}, unread: ${unreadCount})`,
				'',
				...lines,
			].join('\n'),
			mode,
		);
		return;
	}
}

export function parseSubcommand(argv: string[]): {
	command: Subcommand | null;
	json: boolean;
} {
	const json = argv.includes('--json');
	const args = argv.filter((a) => a !== '--json');

	const subcmd = args[0];

	if (!subcmd) {
		return { command: null, json };
	}

	if (subcmd === 'login') {
		const handle = args[1];
		const password = args[2];

		if (!handle || !password) {
			return { command: null, json };
		}

		return { command: { name: 'login', handle, password }, json };
	}

	if (subcmd === 'logout') {
		return { command: { name: 'logout' }, json };
	}

	if (subcmd === 'whoami') {
		return { command: { name: 'whoami' }, json };
	}

	if (subcmd === 'timeline' || subcmd === 'tl') {
		const room = args[1] || DEFAULT_ROOM;
		return { command: { name: 'timeline', room }, json };
	}

	if (subcmd === 'post') {
		const postId = Number(args[1]);

		if (!args[1] || !Number.isInteger(postId) || postId <= 0) {
			return { command: null, json };
		}

		return { command: { name: 'post', postId }, json };
	}

	if (subcmd === 'user') {
		const query = args[1];

		if (!query) {
			return { command: null, json };
		}

		return { command: { name: 'user', query }, json };
	}

	if (subcmd === 'compose') {
		let room = DEFAULT_ROOM;
		const roomIdx = args.indexOf('--room');

		if (roomIdx !== -1 && args[roomIdx + 1]) {
			room = args[roomIdx + 1];
		}

		const skipIndices = new Set<number>([0]);

		if (roomIdx !== -1) {
			skipIndices.add(roomIdx);
			skipIndices.add(roomIdx + 1);
		}

		const text = args
			.filter((_, i) => !skipIndices.has(i) && !args[i].startsWith('--'))
			.join(' ');

		if (!text.trim()) {
			return { command: null, json };
		}

		return { command: { name: 'compose', text, room }, json };
	}

	if (subcmd === 'reply') {
		const postId = Number(args[1]);
		const text = args.slice(2).join(' ');

		if (!args[1] || !Number.isInteger(postId) || postId <= 0 || !text.trim()) {
			return { command: null, json };
		}

		return { command: { name: 'reply', postId, text }, json };
	}

	if (subcmd === 'love') {
		const postId = Number(args[1]);

		if (!args[1] || !Number.isInteger(postId) || postId <= 0) {
			return { command: null, json };
		}

		return { command: { name: 'love', postId }, json };
	}

	if (subcmd === 'boost') {
		const postId = Number(args[1]);

		if (!args[1] || !Number.isInteger(postId) || postId <= 0) {
			return { command: null, json };
		}

		return { command: { name: 'boost', postId }, json };
	}

	if (subcmd === 'react') {
		const postId = Number(args[1]);
		let size = 24;
		let color: string = BRAND.primary;

		const sizeIdx = args.indexOf('--size');

		if (sizeIdx !== -1 && args[sizeIdx + 1]) {
			const parsed = Number(args[sizeIdx + 1]);

			if (Number.isFinite(parsed) && parsed > 0) {
				size = parsed;
			}
		}

		const colorIdx = args.indexOf('--color');

		if (colorIdx !== -1 && args[colorIdx + 1]) {
			color = args[colorIdx + 1];
		}

		const skipIndices = new Set<number>([0, 1]);

		if (sizeIdx !== -1) {
			skipIndices.add(sizeIdx);
			skipIndices.add(sizeIdx + 1);
		}

		if (colorIdx !== -1) {
			skipIndices.add(colorIdx);
			skipIndices.add(colorIdx + 1);
		}

		const text = args.find(
			(a, i) => !skipIndices.has(i) && !a.startsWith('--'),
		);

		if (!args[1] || !Number.isInteger(postId) || postId <= 0 || !text) {
			return { command: null, json };
		}

		return { command: { name: 'react', postId, text, size, color }, json };
	}

	if (subcmd === 'delete') {
		const postId = Number(args[1]);

		if (!args[1] || !Number.isInteger(postId) || postId <= 0) {
			return { command: null, json };
		}

		return { command: { name: 'delete', postId }, json };
	}

	if (subcmd === 'notifications' || subcmd === 'notif') {
		return { command: { name: 'notifications' }, json };
	}

	return { command: null, json };
}
