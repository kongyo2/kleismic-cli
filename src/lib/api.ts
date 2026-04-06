import NodeWebSocket from 'ws';
import { z } from 'zod';
import {
	BASE_URL,
	BRAND,
	DEFAULT_ROOM,
	DEFAULT_TYPING_SPEED_MS,
} from './constants.js';
import { CookieStore } from './cookies.js';

const rawReactionSchema = z
	.object({
		id: z.number(),
		to: z.number(),
		type: z.number().optional().default(0),
		text: z.string(),
		color: z.string(),
		size: z.number(),
		author: z.number(),
	})
	.passthrough();

const rawNestSchema = z
	.object({
		id: z.number(),
		name: z.string(),
		display_name: z.string().nullable().optional(),
		bio: z.string().nullable().optional(),
		posts: z.number().nullable().optional(),
		active_users: z.number().nullable().optional(),
		isfeed: z.boolean().nullable().optional(),
		issensitive: z.boolean().nullable().optional(),
		isimage: z.boolean().nullable().optional(),
		isnoimage: z.boolean().nullable().optional(),
	})
	.passthrough();

const rawUserSchema = z
	.object({
		id: z.number(),
		handle_name: z.string().nullable().optional(),
		display_name: z.string().nullable().optional(),
		bio: z.string().nullable().optional(),
		url: z.string().nullable().optional(),
		embed: z.string().nullable().optional(),
		location: z.string().nullable().optional(),
		followers: z.number().nullable().optional(),
		followees: z.number().nullable().optional(),
		posts: z.number().nullable().optional(),
		posted_chars: z.number().nullable().optional(),
		posted_time: z.number().nullable().optional(),
		ampoule_amount: z.number().nullable().optional(),
		created_nests: z.array(z.unknown()).nullable().optional(),
		ampoule_history: z.array(z.string()).nullable().optional(),
	})
	.passthrough();

const rawPostSchema = z
	.object({
		id: z.number(),
		id_moresimple: z.number().optional(),
		score: z.number().optional(),
		score_withtime: z.number().optional(),
		content: z.string().nullable().optional(),
		author: z.number(),
		date: z.string(),
		date_typingstart: z.string().nullable().optional(),
		reply_to: z.number().nullable().optional(),
		quote_post: z.number().nullable().optional(),
		room: z.string().nullable().optional(),
		room_display_name: z.string().nullable().optional(),
		history: z.string().nullable().optional(),
		likes: z.number().optional(),
		boosts: z.number().optional(),
		replys: z.number().optional(),
		flag: z.number().optional(),
		feed: z.number().optional(),
		ampoule_amount: z.number().nullable().optional(),
		issensitive: z.boolean().optional(),
		reactions: z.string().nullable().optional(),
		replysgets: z.array(z.unknown()).optional(),
	})
	.passthrough();

const rawNotificationSchema = z
	.object({
		id: z.number(),
		state: z.number().nullable().optional(),
		type: z.union([z.number(), z.string()]).nullable().optional(),
		date: z.string().nullable().optional(),
		target: z.number().nullable().optional(),
		author: z.number().nullable().optional(),
		post_id: z.number().nullable().optional(),
		message: z.string().nullable().optional(),
		content: z.string().nullable().optional(),
	})
	.passthrough();

export type KleismicReaction = {
	id: number;
	targetId: number;
	type: number;
	text: string;
	color: string;
	size: number;
	authorId: number;
};

export type KleismicNest = {
	id: number;
	name: string;
	displayName: string;
	bio: string;
	posts: number;
	activeUsers: number;
	isFeed: boolean;
	isSensitive: boolean;
	isImageOnly: boolean;
	isTextOnly: boolean;
};

export type KleismicAmpouleHistoryItem = {
	balanceAfter: number;
	change: number;
	reason: string;
	date: string;
};

export type KleismicUser = {
	id: number;
	handleName: string;
	displayName: string;
	bio: string;
	url: string;
	embed: string;
	location: string;
	followers: number;
	followees: number;
	posts: number;
	postedChars: number;
	postedTime: number;
	ampoule: number;
	createdNests: KleismicNest[];
	ampouleHistory: KleismicAmpouleHistoryItem[];
};

export type KleismicPostPreview = {
	id: number;
	authorId: number;
	content: string;
	date: string;
};

export type KleismicPost = {
	id: number;
	shortId: number;
	content: string;
	authorId: number;
	date: string;
	typingStartedAt: string | null;
	replyToId: number | null;
	room: string | null;
	roomDisplayName: string | null;
	likes: number;
	boosts: number;
	replyCount: number;
	score: number;
	scoreWithTime: number;
	ampouleAmount: number;
	isSensitive: boolean;
	history: string;
	reactions: KleismicReaction[];
	replyPosts: KleismicPostPreview[];
};

export type KleismicNotification = {
	id: number;
	state: number | null;
	type: string;
	date: string | null;
	targetId: number | null;
	authorId: number | null;
	postId: number | null;
	message: string;
	raw: Record<string, unknown>;
};

type RequestResult = {
	ok: boolean;
	status: number;
	text: string;
	data: unknown;
};

function sleep(durationMs: number) {
	return new Promise<void>((resolve) => {
		setTimeout(resolve, durationMs);
	});
}

function asError(error: unknown, fallbackMessage: string) {
	if (error instanceof Error) {
		return error;
	}

	return new Error(fallbackMessage);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonText(text: string) {
	if (text.trim().length === 0) {
		return null;
	}

	try {
		return JSON.parse(text) as unknown;
	} catch {
		return text;
	}
}

function parseReactionList(rawReactions: string | null | undefined) {
	const parsed = parseJsonText(rawReactions ?? '');

	if (!Array.isArray(parsed)) {
		return [];
	}

	return parsed.flatMap((entry) => {
		const result = rawReactionSchema.safeParse(entry);

		if (!result.success) {
			return [];
		}

		return [
			{
				id: result.data.id,
				targetId: result.data.to,
				type: result.data.type,
				text: result.data.text,
				color: result.data.color,
				size: result.data.size,
				authorId: result.data.author,
			} satisfies KleismicReaction,
		];
	});
}

function parseAmpouleHistory(rawHistory: string[] | null | undefined) {
	if (!Array.isArray(rawHistory)) {
		return [];
	}

	return rawHistory.flatMap((entry) => {
		try {
			const parsed = JSON.parse(entry) as unknown;

			if (!Array.isArray(parsed) || parsed.length < 4) {
				return [];
			}

			return [
				{
					balanceAfter: typeof parsed[0] === 'number' ? parsed[0] : 0,
					change: typeof parsed[1] === 'number' ? parsed[1] : 0,
					reason: typeof parsed[2] === 'string' ? parsed[2] : '',
					date: typeof parsed[3] === 'string' ? parsed[3] : '',
				} satisfies KleismicAmpouleHistoryItem,
			];
		} catch {
			return [];
		}
	});
}

function normalizeNest(input: unknown) {
	const result = rawNestSchema.safeParse(input);

	if (!result.success) {
		return null;
	}

	return {
		id: result.data.id,
		name: result.data.name,
		displayName: result.data.display_name ?? result.data.name,
		bio: result.data.bio ?? '',
		posts: result.data.posts ?? 0,
		activeUsers: result.data.active_users ?? 0,
		isFeed: result.data.isfeed ?? false,
		isSensitive: result.data.issensitive ?? false,
		isImageOnly: result.data.isimage ?? false,
		isTextOnly: result.data.isnoimage ?? false,
	} satisfies KleismicNest;
}

function normalizeUser(input: unknown): KleismicUser {
	const raw = rawUserSchema.parse(input);

	return {
		id: raw.id,
		handleName: raw.handle_name ?? '',
		displayName: raw.display_name ?? raw.handle_name ?? '',
		bio: raw.bio ?? '',
		url: raw.url ?? '',
		embed: raw.embed ?? '',
		location: raw.location ?? '',
		followers: raw.followers ?? 0,
		followees: raw.followees ?? 0,
		posts: raw.posts ?? 0,
		postedChars: raw.posted_chars ?? 0,
		postedTime: raw.posted_time ?? 0,
		ampoule: raw.ampoule_amount ?? 0,
		createdNests: (raw.created_nests ?? [])
			.map((entry) => normalizeNest(entry))
			.filter((entry): entry is KleismicNest => Boolean(entry)),
		ampouleHistory: parseAmpouleHistory(raw.ampoule_history),
	};
}

function normalizePostPreview(input: unknown) {
	const result = rawPostSchema.safeParse(input);

	if (!result.success) {
		return null;
	}

	return {
		id: result.data.id,
		authorId: result.data.author,
		content: result.data.content ?? '',
		date: result.data.date,
	} satisfies KleismicPostPreview;
}

function normalizePost(input: unknown): KleismicPost {
	const raw = rawPostSchema.parse(input);

	return {
		id: raw.id,
		shortId: raw.id_moresimple ?? raw.id,
		content: raw.content ?? '',
		authorId: raw.author,
		date: raw.date,
		typingStartedAt: raw.date_typingstart ?? null,
		replyToId: raw.reply_to ?? null,
		room: raw.room ?? null,
		roomDisplayName: raw.room_display_name ?? null,
		likes: raw.likes ?? 0,
		boosts: raw.boosts ?? 0,
		replyCount: raw.replys ?? 0,
		score: raw.score ?? 0,
		scoreWithTime: raw.score_withtime ?? 0,
		ampouleAmount: raw.ampoule_amount ?? 0,
		isSensitive: raw.issensitive ?? false,
		history: raw.history ?? '[]',
		reactions: parseReactionList(raw.reactions),
		replyPosts: (raw.replysgets ?? [])
			.map((entry) => normalizePostPreview(entry))
			.filter((entry): entry is KleismicPostPreview => Boolean(entry)),
	};
}

function normalizeTimeline(data: unknown) {
	if (!Array.isArray(data)) {
		return [];
	}

	const maybePosts =
		data.length > 0 && Array.isArray(data[0]) ? data.slice(1) : data;

	return maybePosts.flatMap((entry) => {
		const result = rawPostSchema.safeParse(entry);

		if (!result.success) {
			return [];
		}

		return [normalizePost(result.data)];
	});
}

function normalizeNotifications(data: unknown) {
	if (!Array.isArray(data)) {
		return [];
	}

	return data.flatMap((entry) => {
		const result = rawNotificationSchema.safeParse(entry);

		if (!result.success) {
			return [];
		}

		return [
			{
				id: result.data.id,
				state: result.data.state ?? null,
				type: String(result.data.type ?? ''),
				date: result.data.date ?? null,
				targetId: result.data.target ?? null,
				authorId: result.data.author ?? null,
				postId: result.data.post_id ?? null,
				message: result.data.message ?? result.data.content ?? '',
				raw: result.data,
			} satisfies KleismicNotification,
		];
	});
}

export class KleismicClient {
	private readonly cookieStore = new CookieStore();

	constructor(private readonly baseUrl = BASE_URL) {}

	setCookies(cookies: Record<string, string>) {
		this.cookieStore.load(cookies);
	}

	getCookies() {
		return this.cookieStore.toObject();
	}

	clearCookies() {
		this.cookieStore.clear();
	}

	private async request(
		path: string,
		options: {
			method?: 'GET' | 'POST';
			json?: unknown;
			timeoutMs?: number;
		} = {},
	): Promise<RequestResult> {
		const headers = new Headers({
			accept: 'application/json, text/plain, */*',
		});

		if (options.json !== undefined) {
			headers.set('content-type', 'application/json');
		}

		const cookieHeader = this.cookieStore.toHeader();

		if (cookieHeader) {
			headers.set('cookie', cookieHeader);
		}

		const response = await fetch(new URL(path, this.baseUrl), {
			method: options.method ?? 'GET',
			headers,
			body:
				options.json === undefined ? undefined : JSON.stringify(options.json),
			signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
		});

		const rawHeaders = response.headers as Headers & {
			getSetCookie?: () => string[];
		};

		this.cookieStore.ingest(
			rawHeaders.getSetCookie?.() ?? response.headers.get('set-cookie'),
		);

		const text = await response.text();
		return {
			ok: response.ok,
			status: response.status,
			text,
			data: parseJsonText(text),
		};
	}

	private errorMessage(result: RequestResult, fallback: string) {
		if (typeof result.data === 'string' && result.data.trim().length > 0) {
			return `${fallback} (${result.data})`;
		}

		if (isPlainObject(result.data)) {
			const message =
				typeof result.data.message === 'string'
					? result.data.message
					: typeof result.data.error === 'string'
						? result.data.error
						: null;

			if (message) {
				return `${fallback} (${message})`;
			}
		}

		return `${fallback} [HTTP ${result.status}]`;
	}

	private ensureOk(result: RequestResult, fallback: string) {
		if (!result.ok) {
			throw new Error(this.errorMessage(result, fallback));
		}
	}

	async login(handleName: string, password: string) {
		const result = await this.request('/api/login', {
			method: 'POST',
			json: {
				handle_name: handleName,
				password,
			},
		});

		this.ensureOk(result, 'ログインに失敗しました');

		const user = await this.getMe();

		if (!user) {
			throw new Error('ログインに失敗しました。セッションを取得できません。');
		}

		return user;
	}

	async getMe() {
		const result = await this.request('/api/info/');

		if (!result.ok) {
			throw new Error(
				this.errorMessage(result, 'プロフィール取得に失敗しました'),
			);
		}

		if (result.data === null) {
			return null;
		}

		return normalizeUser(result.data);
	}

	async getTimeline(room = DEFAULT_ROOM) {
		const path =
			room === DEFAULT_ROOM
				? '/api/history/index'
				: `/api/community/history/${encodeURIComponent(room)}`;
		const result = await this.request(path);
		this.ensureOk(result, 'タイムライン取得に失敗しました');
		return normalizeTimeline(result.data);
	}

	async getPost(postId: number) {
		const result = await this.request(`/api/post/${postId}`);
		this.ensureOk(result, '投稿取得に失敗しました');
		return normalizePost(result.data);
	}

	async getUserById(userId: number) {
		const result = await this.request(`/api/info/${userId}`);

		if (!result.ok) {
			throw new Error(this.errorMessage(result, 'ユーザー取得に失敗しました'));
		}

		if (
			result.data === null ||
			(isPlainObject(result.data) && Object.keys(result.data).length === 0)
		) {
			return null;
		}

		return normalizeUser(result.data);
	}

	async getUserByHandle(handle: string) {
		const cleanHandle = handle.trim().replace(/^@/, '');

		if (cleanHandle.length === 0) {
			return null;
		}

		const result = await this.request(
			`/api/info/hn/${encodeURIComponent(cleanHandle)}`,
		);

		if (
			result.status === 400 ||
			result.status === 404 ||
			result.data === null
		) {
			return null;
		}

		if (!result.ok) {
			throw new Error(this.errorMessage(result, 'ユーザー取得に失敗しました'));
		}

		return normalizeUser(result.data);
	}

	async getUserPosts(userId: number) {
		const result = await this.request(`/api/history/${userId}`);
		this.ensureOk(result, 'ユーザー投稿の取得に失敗しました');
		return normalizeTimeline(result.data);
	}

	async getNotifications() {
		const result = await this.request('/api/notify/history');
		this.ensureOk(result, '通知の取得に失敗しました');
		return normalizeNotifications(result.data);
	}

	async getUnreadNotifications() {
		const notifications = await this.getNotifications();
		return notifications.filter((entry) => entry.state === 0);
	}

	private async mutate(path: string, json: unknown, fallback: string) {
		const result = await this.request(path, {
			method: 'POST',
			json,
		});

		this.ensureOk(result, fallback);
		return result.data;
	}

	async love(postId: number, toggle = 1) {
		await this.mutate(
			'/api/love',
			{ id: postId, toggle },
			'Love の送信に失敗しました',
		);
	}

	async boost(postId: number, toggle = 1) {
		await this.mutate(
			'/api/boost',
			{ id: postId, toggle },
			'Boost の送信に失敗しました',
		);
	}

	async reaction(
		postId: number,
		text: string,
		size = 24,
		color: string = BRAND.primary,
	) {
		await this.mutate(
			'/api/makereaction',
			{
				target: postId,
				text,
				size,
				color,
			},
			'リアクション送信に失敗しました',
		);
	}

	async deletePost(postId: number) {
		await this.mutate('/api/del', { id: postId }, '投稿削除に失敗しました');
	}

	async sendAmpoule(target: number, amount: number) {
		const result = await this.request('/api/ampoule/send', {
			method: 'POST',
			json: {
				target,
				amount,
			},
		});

		this.ensureOk(result, 'アンプル送信に失敗しました');
		return typeof result.data === 'string' ? result.data : result.text;
	}

	async sendPost(
		text: string,
		room = DEFAULT_ROOM,
		speedMs = DEFAULT_TYPING_SPEED_MS,
	) {
		await this.sendTypingPayload(room, text, speedMs);
	}

	async replyPost(
		postId: number,
		text: string,
		speedMs = DEFAULT_TYPING_SPEED_MS,
	) {
		await this.sendTypingPayload(`__${postId}`, text, speedMs);
	}

	private async sendTypingPayload(
		target: string,
		text: string,
		speedMs: number,
	) {
		if (!text.trim()) {
			throw new Error('本文を入力してください');
		}

		const cookieHeader = this.cookieStore.toHeader();

		if (!cookieHeader) {
			throw new Error('この操作にはログインが必要です');
		}

		const endpoint = `${this.baseUrl.replace('https://', 'wss://').replace('http://', 'ws://')}/ws/typing/${target}`;

		await new Promise<void>((resolve, reject) => {
			const socket = new NodeWebSocket(endpoint, {
				headers: {
					Cookie: cookieHeader,
				},
			});

			let settled = false;

			const finish = (error?: Error) => {
				if (settled) {
					return;
				}

				settled = true;
				clearTimeout(timeout);

				if (error) {
					reject(error);
					return;
				}

				resolve();
			};

			const timeout = setTimeout(() => {
				socket.close();
				finish(new Error('WebSocket 接続がタイムアウトしました'));
			}, 15_000);

			socket.on('error', (error) => {
				finish(asError(error, '投稿に失敗しました'));
			});

			socket.on('close', (code) => {
				if (!settled && code !== 1000) {
					finish(new Error('WebSocket 接続が途中で切断されました'));
				}
			});

			socket.on('open', async () => {
				try {
					await sleep(200);

					let buffer = '';
					for (const character of text) {
						buffer += character;
						socket.send(buffer);
						await sleep(speedMs);
					}

					await sleep(200);
					socket.send(text);
					socket.send('__POST__');
					await sleep(200);
					socket.close();
					finish();
				} catch (error) {
					socket.close();
					finish(asError(error, '投稿に失敗しました'));
				}
			});
		});
	}
}
