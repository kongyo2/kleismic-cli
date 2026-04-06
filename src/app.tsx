import {
	Alert,
	Badge,
	ConfirmInput,
	OrderedList,
	ProgressBar,
	Select,
	Spinner,
	TextInput,
	PasswordInput,
	UnorderedList,
} from '@inkjs/ui';
import { Box, Text, useApp, useInput } from 'ink';
import { useEffect, useReducer, useState } from 'react';
import { z } from 'zod';
import {
	KleismicClient,
	type KleismicNotification,
	type KleismicPost,
	type KleismicUser,
} from './lib/api.js';
import { buildTypingFrames, decodeComposerText } from './lib/history.js';
import {
	APP_DESCRIPTION,
	APP_TAGLINE,
	APP_WELCOME,
	BASE_URL,
	BRAND,
	DEFAULT_ROOM,
} from './lib/constants.js';
import { clearSession, loadSession, saveSession } from './lib/session.js';
import { AppFrame } from './ui/frame.js';

type FlashMessage = {
	variant: 'info' | 'success' | 'warning' | 'error';
	message: string;
};

type ReturnView =
	| { kind: 'menu' }
	| { kind: 'timeline'; room: string }
	| { kind: 'user'; query: string }
	| { kind: 'notifications' };

type View =
	| { kind: 'menu' }
	| { kind: 'login' }
	| { kind: 'logout' }
	| { kind: 'timelinePicker'; defaultRoom: string }
	| { kind: 'timeline'; room: string }
	| { kind: 'lookupPost'; returnTo: ReturnView }
	| { kind: 'lookupUser' }
	| { kind: 'post'; postId: number; returnTo: ReturnView }
	| { kind: 'compose'; room: string }
	| { kind: 'composeReply'; postId: number; returnTo: ReturnView }
	| { kind: 'reaction'; postId: number; returnTo: ReturnView }
	| { kind: 'user'; query: string }
	| { kind: 'notifications' }
	| {
			kind: 'typingReplay';
			postId: number;
			history: string;
			returnTo: ReturnView;
	  };

type AppState = {
	booting: boolean;
	view: View;
	currentUser: KleismicUser | null;
	flash: FlashMessage | null;
};

type AppAction =
	| { type: 'bootComplete' }
	| { type: 'restoreSession'; user: KleismicUser; flash: FlashMessage }
	| { type: 'setView'; view: View }
	| { type: 'setFlash'; flash: FlashMessage | null }
	| { type: 'loginSuccess'; user: KleismicUser; flash: FlashMessage }
	| { type: 'logoutSuccess'; flash: FlashMessage };

const initialAppState: AppState = {
	booting: true,
	view: { kind: 'menu' },
	currentUser: null,
	flash: null,
};

function appReducer(state: AppState, action: AppAction): AppState {
	if (action.type === 'bootComplete') {
		return {
			...state,
			booting: false,
		};
	}

	if (action.type === 'restoreSession') {
		return {
			...state,
			currentUser: action.user,
			flash: action.flash,
		};
	}

	if (action.type === 'setView') {
		return {
			...state,
			view: action.view,
		};
	}

	if (action.type === 'setFlash') {
		return {
			...state,
			flash: action.flash,
		};
	}

	if (action.type === 'loginSuccess') {
		return {
			...state,
			currentUser: action.user,
			flash: action.flash,
			view: { kind: 'menu' },
		};
	}

	return {
		...state,
		currentUser: null,
		flash: action.flash,
		view: { kind: 'menu' },
	};
}

const roomInputSchema = z.string().trim().min(1);
const postLookupSchema = z.coerce.number().int().positive();
const userLookupSchema = z.string().trim().min(1);
const reactionFormSchema = z.object({
	text: z.string().trim().min(1).max(24),
	size: z.coerce.number().int().min(1).max(99),
	color: z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/),
});

export function App() {
	const { exit } = useApp();
	const [client] = useState(() => new KleismicClient());
	const [state, dispatch] = useReducer(appReducer, initialAppState);
	const { booting, view, currentUser, flash } = state;

	useEffect(() => {
		let cancelled = false;

		void (async () => {
			try {
				const storedSession = await loadSession();

				if (storedSession) {
					client.setCookies(storedSession.cookies);
					const restoredUser = await client.getMe().catch(() => null);

					if (cancelled) {
						return;
					}

					if (restoredUser) {
						dispatch({
							type: 'restoreSession',
							user: restoredUser,
							flash: {
								variant: 'success',
								message: `保存済みセッションを復元しました: ${restoredUser.displayName || restoredUser.handleName}`,
							},
						});
					} else {
						client.clearCookies();
						await clearSession();
					}
				}
			} finally {
				if (!cancelled) {
					dispatch({ type: 'bootComplete' });
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [client]);

	useEffect(() => {
		if (!flash) {
			return;
		}

		const timeout = setTimeout(() => {
			dispatch({ type: 'setFlash', flash: null });
		}, 6000);

		return () => {
			clearTimeout(timeout);
		};
	}, [flash]);

	async function persistSession(user: KleismicUser) {
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
	}

	function requireLogin(message: string) {
		dispatch({ type: 'setFlash', flash: { variant: 'warning', message } });
		dispatch({ type: 'setView', view: { kind: 'login' } });
	}

	async function handleLogin(handleName: string, password: string) {
		const user = await client.login(handleName, password);
		await persistSession(user);
		dispatch({
			type: 'loginSuccess',
			user,
			flash: {
				variant: 'success',
				message: `${user.displayName || user.handleName} としてログインしました`,
			},
		});
	}

	async function handleLogout() {
		client.clearCookies();
		await clearSession();
		dispatch({
			type: 'logoutSuccess',
			flash: {
				variant: 'success',
				message: '保存済みセッションを削除しました',
			},
		});
	}

	function openPost(postId: number, returnTo: ReturnView) {
		dispatch({ type: 'setView', view: { kind: 'post', postId, returnTo } });
	}

	function openUser(query: string) {
		dispatch({ type: 'setView', view: { kind: 'user', query } });
	}

	if (booting) {
		return (
			<AppFrame
				title="Boot"
				subtitle="セッションと Kleismic API の状態を確認しています"
				currentUser={currentUser}
				flash={flash}
				footer="Ctrl+C で終了"
			>
				<Spinner label="起動しています..." />
			</AppFrame>
		);
	}

	return (
		<AppRouter
			client={client}
			currentUser={currentUser}
			flash={flash}
			view={view}
			onQuit={exit}
			onSetView={(nextView) => {
				dispatch({ type: 'setView', view: nextView });
			}}
			onLogin={handleLogin}
			onLogout={handleLogout}
			onOpenPost={openPost}
			onOpenUser={openUser}
			onRequireLogin={requireLogin}
			onFlash={(nextFlash) => {
				dispatch({ type: 'setFlash', flash: nextFlash });
			}}
		/>
	);
}

type AppRouterProps = {
	client: KleismicClient;
	currentUser: KleismicUser | null;
	flash: FlashMessage | null;
	view: View;
	onQuit: () => void;
	onSetView: (view: View) => void;
	onLogin: (handleName: string, password: string) => Promise<void>;
	onLogout: () => Promise<void>;
	onOpenPost: (postId: number, returnTo: ReturnView) => void;
	onOpenUser: (query: string) => void;
	onRequireLogin: (message: string) => void;
	onFlash: (flash: FlashMessage | null) => void;
};

function AppRouter(props: AppRouterProps) {
	const { client, currentUser, flash, view } = props;

	if (view.kind === 'menu') {
		return (
			<MenuScreen
				currentUser={currentUser}
				flash={flash}
				onQuit={props.onQuit}
				onSelect={(value) => {
					if (value === 'timeline') {
						props.onSetView({
							kind: 'timelinePicker',
							defaultRoom: DEFAULT_ROOM,
						});
						return;
					}

					if (value === 'compose') {
						if (!currentUser) {
							props.onRequireLogin('投稿にはログインが必要です');
							return;
						}

						props.onSetView({ kind: 'compose', room: DEFAULT_ROOM });
						return;
					}

					if (value === 'post') {
						props.onSetView({ kind: 'lookupPost', returnTo: { kind: 'menu' } });
						return;
					}

					if (value === 'user') {
						props.onSetView({ kind: 'lookupUser' });
						return;
					}

					if (value === 'me' && currentUser) {
						props.onOpenUser(String(currentUser.id));
						return;
					}

					if (value === 'notifications') {
						if (!currentUser) {
							props.onRequireLogin('通知を見るにはログインが必要です');
							return;
						}

						props.onSetView({ kind: 'notifications' });
						return;
					}

					if (value === 'session') {
						props.onSetView(
							currentUser ? { kind: 'logout' } : { kind: 'login' },
						);
						return;
					}

					props.onQuit();
				}}
			/>
		);
	}

	if (view.kind === 'login') {
		return (
			<LoginScreen
				currentUser={currentUser}
				flash={flash}
				onBack={() => {
					props.onSetView({ kind: 'menu' });
				}}
				onLogin={props.onLogin}
			/>
		);
	}

	if (view.kind === 'logout') {
		return (
			<LogoutScreen
				currentUser={currentUser}
				flash={flash}
				onBack={() => {
					props.onSetView({ kind: 'menu' });
				}}
				onConfirm={props.onLogout}
			/>
		);
	}

	if (view.kind === 'timelinePicker') {
		return (
			<TimelinePickerScreen
				currentUser={currentUser}
				flash={flash}
				defaultRoom={view.defaultRoom}
				onBack={() => {
					props.onSetView({ kind: 'menu' });
				}}
				onSubmit={(room) => {
					props.onSetView({ kind: 'timeline', room });
				}}
			/>
		);
	}

	if (view.kind === 'timeline') {
		return (
			<TimelineScreen
				client={client}
				currentUser={currentUser}
				flash={flash}
				room={view.room}
				onBack={() => {
					props.onSetView({ kind: 'menu' });
				}}
				onChangeRoom={() => {
					props.onSetView({ kind: 'timelinePicker', defaultRoom: view.room });
				}}
				onOpenPost={(postId) => {
					props.onOpenPost(postId, { kind: 'timeline', room: view.room });
				}}
			/>
		);
	}

	if (view.kind === 'lookupPost') {
		return (
			<PostLookupScreen
				currentUser={currentUser}
				flash={flash}
				onBack={() => {
					props.onSetView(view.returnTo);
				}}
				onSubmit={(postId) => {
					props.onOpenPost(postId, view.returnTo);
				}}
			/>
		);
	}

	if (view.kind === 'lookupUser') {
		return (
			<UserLookupScreen
				currentUser={currentUser}
				flash={flash}
				onBack={() => {
					props.onSetView({ kind: 'menu' });
				}}
				onSubmit={(query) => {
					props.onOpenUser(query);
				}}
			/>
		);
	}

	if (view.kind === 'post') {
		return (
			<PostScreen
				client={client}
				currentUser={currentUser}
				flash={flash}
				postId={view.postId}
				onBack={() => {
					props.onSetView(view.returnTo);
				}}
				onOpenUser={(query) => {
					props.onOpenUser(query);
				}}
				onReply={(postId) => {
					if (!currentUser) {
						props.onRequireLogin('返信にはログインが必要です');
						return;
					}

					props.onSetView({
						kind: 'composeReply',
						postId,
						returnTo: view.returnTo,
					});
				}}
				onReact={(postId) => {
					if (!currentUser) {
						props.onRequireLogin('リアクションにはログインが必要です');
						return;
					}

					props.onSetView({
						kind: 'reaction',
						postId,
						returnTo: view.returnTo,
					});
				}}
				onReplay={(post) => {
					props.onSetView({
						kind: 'typingReplay',
						postId: post.id,
						history: post.history,
						returnTo: view.returnTo,
					});
				}}
				onDeleted={() => {
					props.onFlash({ variant: 'success', message: '投稿を削除しました' });
					props.onSetView(view.returnTo);
				}}
				onRequireLogin={props.onRequireLogin}
				onFlash={props.onFlash}
			/>
		);
	}

	if (view.kind === 'compose') {
		return (
			<ComposeScreen
				currentUser={currentUser}
				flash={flash}
				room={view.room}
				onBack={() => {
					props.onSetView({ kind: 'menu' });
				}}
				onSubmit={async ({ room, text }) => {
					await client.sendPost(text, room);
					props.onFlash({
						variant: 'success',
						message: `${room === DEFAULT_ROOM ? 'index' : room} に投稿しました`,
					});
					props.onSetView({ kind: 'timeline', room });
				}}
			/>
		);
	}

	if (view.kind === 'composeReply') {
		return (
			<ComposeScreen
				currentUser={currentUser}
				flash={flash}
				replyToId={view.postId}
				onBack={() => {
					props.onOpenPost(view.postId, view.returnTo);
				}}
				onSubmit={async ({ text }) => {
					await client.replyPost(view.postId, text);
					props.onFlash({
						variant: 'success',
						message: `#${view.postId} へ返信しました`,
					});
					props.onOpenPost(view.postId, view.returnTo);
				}}
			/>
		);
	}

	if (view.kind === 'reaction') {
		return (
			<ReactionScreen
				currentUser={currentUser}
				flash={flash}
				postId={view.postId}
				onBack={() => {
					props.onOpenPost(view.postId, view.returnTo);
				}}
				onSubmit={async (form) => {
					await client.reaction(view.postId, form.text, form.size, form.color);
					props.onFlash({
						variant: 'success',
						message: `#${view.postId} にリアクションを送信しました`,
					});
					props.onOpenPost(view.postId, view.returnTo);
				}}
			/>
		);
	}

	if (view.kind === 'user') {
		return (
			<UserScreen
				client={client}
				currentUser={currentUser}
				flash={flash}
				query={view.query}
				onBack={() => {
					props.onSetView({ kind: 'menu' });
				}}
				onOpenPost={(postId) => {
					props.onOpenPost(postId, { kind: 'user', query: view.query });
				}}
			/>
		);
	}

	if (view.kind === 'notifications') {
		return (
			<NotificationsScreen
				client={client}
				currentUser={currentUser}
				flash={flash}
				onBack={() => {
					props.onSetView({ kind: 'menu' });
				}}
				onOpenPost={(postId) => {
					props.onOpenPost(postId, { kind: 'notifications' });
				}}
			/>
		);
	}

	return (
		<TypingReplayScreen
			currentUser={currentUser}
			flash={flash}
			postId={view.postId}
			history={view.history}
			onBack={() => {
				props.onOpenPost(view.postId, view.returnTo);
			}}
		/>
	);
}

function MenuScreen(props: {
	currentUser: KleismicUser | null;
	flash: FlashMessage | null;
	onQuit: () => void;
	onSelect: (value: string) => void;
}) {
	useInput((input) => {
		if (input.toLowerCase() === 'q') {
			props.onQuit();
		}
	});

	const options = [
		{ label: '公開タイムラインを見る', value: 'timeline' },
		{ label: '投稿する', value: 'compose' },
		{ label: '投稿 ID で開く', value: 'post' },
		{ label: 'ユーザーを探す', value: 'user' },
	];

	if (props.currentUser) {
		options.push({ label: '自分のプロフィール', value: 'me' });
		options.push({ label: '通知を見る', value: 'notifications' });
	}

	options.push({
		label: props.currentUser ? 'ログアウトする' : 'ログインする',
		value: 'session',
	});
	options.push({ label: '終了', value: 'quit' });

	return (
		<AppFrame
			title="Menu"
			subtitle={APP_TAGLINE}
			currentUser={props.currentUser}
			flash={props.flash}
			footer="Enter で決定 / q で終了"
		>
			<Alert variant="info" title={APP_WELCOME}>
				{APP_DESCRIPTION}
			</Alert>

			{props.currentUser ? (
				<Box gap={1} flexWrap="wrap">
					<Badge color={BRAND.primary}>
						posts {prettyNumber(props.currentUser.posts)}
					</Badge>
					<Badge color={BRAND.primary}>
						followers {prettyNumber(props.currentUser.followers)}
					</Badge>
					<Badge color={BRAND.primary}>
						ampoule {props.currentUser.ampoule.toFixed(1)}
					</Badge>
				</Box>
			) : (
				<Alert variant="warning" title="Guest Mode">
					閲覧は公開情報だけで始められます。投稿、返信、リアクション、通知はログイン後に有効になります。
				</Alert>
			)}

			<UnorderedList>
				<UnorderedList.Item>
					<Text color={BRAND.secondary}>公開タイムラインの閲覧</Text>
				</UnorderedList.Item>
				<UnorderedList.Item>
					<Text color={BRAND.secondary}>投稿詳細とリアクションの確認</Text>
				</UnorderedList.Item>
				<UnorderedList.Item>
					<Text color={BRAND.secondary}>タイピング履歴のリプレイ</Text>
				</UnorderedList.Item>
			</UnorderedList>

			<Select
				options={options}
				visibleOptionCount={8}
				onChange={props.onSelect}
			/>
		</AppFrame>
	);
}

function LoginScreen(props: {
	currentUser: KleismicUser | null;
	flash: FlashMessage | null;
	onBack: () => void;
	onLogin: (handleName: string, password: string) => Promise<void>;
}) {
	const [step, setStep] = useState<'handle' | 'password' | 'submitting'>(
		'handle',
	);
	const [handleName, setHandleName] = useState('');
	const [password, setPassword] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [passwordInputKey, setPasswordInputKey] = useState(0);

	useInput((_input, key) => {
		if (key.escape && step !== 'submitting') {
			props.onBack();
		}
	});

	async function submitPassword(nextPassword: string) {
		if (!nextPassword.trim()) {
			setError('password を入力してください');
			setPasswordInputKey((value) => value + 1);
			return;
		}

		setPassword(nextPassword);
		setError(null);
		setStep('submitting');

		try {
			await props.onLogin(handleName, nextPassword);
		} catch (loginError) {
			setError(toMessage(loginError));
			setPassword('');
			setPasswordInputKey((value) => value + 1);
			setStep('password');
		}
	}

	return (
		<AppFrame
			title="Login"
			subtitle="handle_name と password を順に入力します"
			currentUser={props.currentUser}
			flash={props.flash}
			footer="Esc で戻る"
		>
			{error ? <Alert variant="error">{error}</Alert> : null}

			{step === 'submitting' ? (
				<Spinner label="ログインしています..." />
			) : step === 'handle' ? (
				<>
					<Text color={BRAND.secondary}>1 / 2: handle_name</Text>
					<TextInput
						placeholder="feriderike"
						onChange={(value) => {
							setHandleName(value.trim());
						}}
						onSubmit={(value) => {
							const nextHandle = value.trim();

							if (!nextHandle) {
								setError('handle_name を入力してください');
								return;
							}

							setError(null);
							setHandleName(nextHandle);
							setStep('password');
						}}
					/>
				</>
			) : (
				<>
					<Text color={BRAND.secondary}>2 / 2: password</Text>
					<Text color={BRAND.secondary} dimColor>
						handle_name: {handleName}
					</Text>
					<PasswordInput
						key={passwordInputKey}
						placeholder="password"
						onChange={(value) => {
							setPassword(value);
						}}
						onSubmit={submitPassword}
					/>
					{password ? (
						<Text color={BRAND.secondary} dimColor>
							入力中: {'*'.repeat(password.length)}
						</Text>
					) : null}
				</>
			)}
		</AppFrame>
	);
}

function LogoutScreen(props: {
	currentUser: KleismicUser | null;
	flash: FlashMessage | null;
	onBack: () => void;
	onConfirm: () => Promise<void>;
}) {
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useInput((_input, key) => {
		if (key.escape && !submitting) {
			props.onBack();
		}
	});

	return (
		<AppFrame
			title="Logout"
			subtitle="保存済みセッションを削除します"
			currentUser={props.currentUser}
			flash={props.flash}
			footer="Esc で戻る"
		>
			{error ? <Alert variant="error">{error}</Alert> : null}
			{submitting ? (
				<Spinner label="ログアウトしています..." />
			) : (
				<>
					<Text color={BRAND.secondary}>
						現在のセッションを削除してゲストモードに戻ります。続行しますか?
					</Text>
					<ConfirmInput
						onConfirm={() => {
							setSubmitting(true);
							void props.onConfirm().catch((logoutError) => {
								setError(toMessage(logoutError));
								setSubmitting(false);
							});
						}}
						onCancel={props.onBack}
					/>
				</>
			)}
		</AppFrame>
	);
}

function TimelinePickerScreen(props: {
	currentUser: KleismicUser | null;
	flash: FlashMessage | null;
	defaultRoom: string;
	onBack: () => void;
	onSubmit: (room: string) => void;
}) {
	const [room, setRoom] = useState(props.defaultRoom);
	const [error, setError] = useState<string | null>(null);

	useInput((_input, key) => {
		if (key.escape) {
			props.onBack();
		}
	});

	return (
		<AppFrame
			title="Timeline Target"
			subtitle="閲覧する timeline / room を指定します"
			currentUser={props.currentUser}
			flash={props.flash}
			footer="Esc で戻る"
		>
			{error ? <Alert variant="error">{error}</Alert> : null}
			<Text color={BRAND.secondary}>
				空欄で Enter を押すと index を開きます。
			</Text>
			<TextInput
				defaultValue={props.defaultRoom}
				placeholder="index"
				onChange={setRoom}
				onSubmit={(value) => {
					const nextRoom = (value.trim() || DEFAULT_ROOM).trim();
					const parsed = roomInputSchema.safeParse(nextRoom);

					if (!parsed.success) {
						setError('room 名を入力してください');
						return;
					}

					setError(null);
					props.onSubmit(parsed.data);
				}}
			/>
			<UnorderedList>
				<UnorderedList.Item>
					<Text color={BRAND.secondary}>index</Text>
				</UnorderedList.Item>
				<UnorderedList.Item>
					<Text color={BRAND.secondary}>1_nichi_1_geko</Text>
				</UnorderedList.Item>
			</UnorderedList>
			{room ? (
				<Text color={BRAND.secondary} dimColor>
					入力中: {room}
				</Text>
			) : null}
		</AppFrame>
	);
}

function TimelineScreen(props: {
	client: KleismicClient;
	currentUser: KleismicUser | null;
	flash: FlashMessage | null;
	room: string;
	onBack: () => void;
	onChangeRoom: () => void;
	onOpenPost: (postId: number) => void;
}) {
	const [loading, setLoading] = useState(true);
	const [posts, setPosts] = useState<KleismicPost[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [refreshToken, setRefreshToken] = useState(0);

	useEffect(() => {
		let cancelled = false;

		void (async () => {
			setLoading(true);
			setError(null);

			try {
				const nextPosts = await props.client.getTimeline(props.room);

				if (!cancelled) {
					setPosts(nextPosts);
				}
			} catch (timelineError) {
				if (!cancelled) {
					setError(toMessage(timelineError));
				}
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [props.client, props.room, refreshToken]);

	useInput(
		(input) => {
			const normalized = input.toLowerCase();

			if (normalized === 'b') {
				props.onBack();
			}

			if (normalized === 'c') {
				props.onChangeRoom();
			}

			if (normalized === 'r') {
				setRefreshToken((value) => value + 1);
			}
		},
		{ isActive: !loading },
	);

	return (
		<AppFrame
			title={`Timeline / ${props.room === DEFAULT_ROOM ? 'index' : props.room}`}
			subtitle="Enter で投稿詳細 / r で更新 / c で room 変更 / b で戻る"
			currentUser={props.currentUser}
			flash={props.flash}
		>
			{loading ? <Spinner label="タイムラインを取得しています..." /> : null}
			{error ? <Alert variant="error">{error}</Alert> : null}

			{!loading && !error ? (
				<>
					<Box gap={1} flexWrap="wrap">
						<Badge color={BRAND.primary}>{posts.length} posts</Badge>
						<Badge color={BRAND.primary}>room {props.room}</Badge>
					</Box>

					{posts.length === 0 ? (
						<Alert variant="warning">投稿が見つかりませんでした。</Alert>
					) : (
						<Select
							visibleOptionCount={10}
							options={posts.map((post) => ({
								value: String(post.id),
								label: formatPostOption(post),
							}))}
							onChange={(value) => {
								props.onOpenPost(Number(value));
							}}
						/>
					)}
				</>
			) : null}
		</AppFrame>
	);
}

function PostLookupScreen(props: {
	currentUser: KleismicUser | null;
	flash: FlashMessage | null;
	onBack: () => void;
	onSubmit: (postId: number) => void;
}) {
	const [error, setError] = useState<string | null>(null);
	const [value, setValue] = useState('');

	useInput((_input, key) => {
		if (key.escape) {
			props.onBack();
		}
	});

	return (
		<AppFrame
			title="Open Post"
			subtitle="投稿 ID を入力します"
			currentUser={props.currentUser}
			flash={props.flash}
			footer="Esc で戻る"
		>
			{error ? <Alert variant="error">{error}</Alert> : null}
			<TextInput
				placeholder="1000560337"
				onChange={setValue}
				onSubmit={(rawValue) => {
					const parsed = postLookupSchema.safeParse(rawValue);

					if (!parsed.success) {
						setError('正の整数の投稿 ID を入力してください');
						return;
					}

					setError(null);
					props.onSubmit(parsed.data);
				}}
			/>
			{value ? (
				<Text color={BRAND.secondary} dimColor>
					入力中: {value}
				</Text>
			) : null}
		</AppFrame>
	);
}

function UserLookupScreen(props: {
	currentUser: KleismicUser | null;
	flash: FlashMessage | null;
	onBack: () => void;
	onSubmit: (query: string) => void;
}) {
	const [error, setError] = useState<string | null>(null);

	useInput((_input, key) => {
		if (key.escape) {
			props.onBack();
		}
	});

	return (
		<AppFrame
			title="Lookup User"
			subtitle="user ID または handle_name を入力します"
			currentUser={props.currentUser}
			flash={props.flash}
			footer="Esc で戻る"
		>
			{error ? <Alert variant="error">{error}</Alert> : null}
			<TextInput
				placeholder="7853 or feriderike"
				onSubmit={(rawValue) => {
					const parsed = userLookupSchema.safeParse(rawValue);

					if (!parsed.success) {
						setError('ユーザー ID または handle_name を入力してください');
						return;
					}

					setError(null);
					props.onSubmit(parsed.data);
				}}
			/>
		</AppFrame>
	);
}

function PostScreen(props: {
	client: KleismicClient;
	currentUser: KleismicUser | null;
	flash: FlashMessage | null;
	postId: number;
	onBack: () => void;
	onOpenUser: (query: string) => void;
	onReply: (postId: number) => void;
	onReact: (postId: number) => void;
	onReplay: (post: KleismicPost) => void;
	onDeleted: () => void;
	onRequireLogin: (message: string) => void;
	onFlash: (flash: FlashMessage | null) => void;
}) {
	const [loading, setLoading] = useState(true);
	const [post, setPost] = useState<KleismicPost | null>(null);
	const [author, setAuthor] = useState<KleismicUser | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [refreshToken, setRefreshToken] = useState(0);
	const [pendingAction, setPendingAction] = useState<string | null>(null);
	const [confirmDelete, setConfirmDelete] = useState(false);

	useEffect(() => {
		let cancelled = false;

		void (async () => {
			setLoading(true);
			setError(null);

			try {
				const loadedPost = await props.client.getPost(props.postId);
				const loadedAuthor = await props.client
					.getUserById(loadedPost.authorId)
					.catch(() => null);

				if (!cancelled) {
					setPost(loadedPost);
					setAuthor(loadedAuthor);
				}
			} catch (postError) {
				if (!cancelled) {
					setError(toMessage(postError));
				}
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [props.client, props.postId, refreshToken]);

	useInput(
		(input) => {
			const normalized = input.toLowerCase();

			if (normalized === 'b') {
				props.onBack();
			}

			if (normalized === 'r') {
				setRefreshToken((value) => value + 1);
			}
		},
		{ isActive: !loading && !pendingAction && !confirmDelete },
	);

	if (loading) {
		return (
			<AppFrame
				title={`Post / #${props.postId}`}
				subtitle="投稿詳細を取得しています"
				currentUser={props.currentUser}
				flash={props.flash}
			>
				<Spinner label="投稿を取得しています..." />
			</AppFrame>
		);
	}

	if (error || !post) {
		return (
			<AppFrame
				title={`Post / #${props.postId}`}
				subtitle="投稿詳細を開けませんでした"
				currentUser={props.currentUser}
				flash={props.flash}
				footer="b で戻る"
			>
				<Alert variant="error">{error ?? '投稿が見つかりませんでした'}</Alert>
			</AppFrame>
		);
	}

	const canMutate = Boolean(props.currentUser);
	const isAuthor = props.currentUser?.id === post.authorId;
	const actions = [
		{ label: '投稿者を見る', value: 'author' },
		{ label: 'タイピング履歴を再生', value: 'replay' },
	];

	if (canMutate) {
		actions.unshift({ label: '返信する', value: 'reply' });
		actions.unshift({ label: 'リアクションを送る', value: 'reaction' });
		actions.unshift({ label: 'Boost を送る', value: 'boost' });
		actions.unshift({ label: 'Love を送る', value: 'love' });
	}

	if (isAuthor) {
		actions.unshift({ label: '投稿を削除する', value: 'delete' });
	}

	actions.push({ label: '戻る', value: 'back' });

	return (
		<AppFrame
			title={`Post / #${post.shortId}`}
			subtitle="Enter で操作 / r で再取得 / b で戻る"
			currentUser={props.currentUser}
			flash={props.flash}
		>
			{pendingAction ? <Spinner label={pendingAction} /> : null}

			<Box gap={1} flexWrap="wrap">
				<Badge color={BRAND.primary}>author #{post.authorId}</Badge>
				<Badge color={BRAND.primary}>love {prettyNumber(post.likes)}</Badge>
				<Badge color={BRAND.primary}>boost {prettyNumber(post.boosts)}</Badge>
				<Badge color={BRAND.primary}>
					reply {prettyNumber(post.replyCount)}
				</Badge>
			</Box>

			<Text color={BRAND.secondary} dimColor>
				{author
					? `${author.displayName || author.handleName} / @${author.handleName || author.id}`
					: `user#${post.authorId}`}{' '}
				/ {formatDate(post.date)}
			</Text>

			<Text color={BRAND.secondary} wrap="wrap">
				{post.content || '(empty)'}
			</Text>

			{post.reactions.length > 0 ? (
				<Box gap={1} flexWrap="wrap">
					{post.reactions.slice(0, 8).map((reaction) => (
						<Badge key={reaction.id} color={reaction.color}>
							{reaction.text} {reaction.size}
						</Badge>
					))}
				</Box>
			) : null}

			{post.replyPosts.length > 0 ? (
				<>
					<Text color={BRAND.secondary} bold>
						Replies
					</Text>
					<OrderedList>
						{post.replyPosts.slice(0, 3).map((reply) => (
							<OrderedList.Item key={reply.id}>
								<Text color={BRAND.secondary}>
									{compact(reply.content, 52)}
								</Text>
							</OrderedList.Item>
						))}
					</OrderedList>
				</>
			) : null}

			<Text color={BRAND.secondary} dimColor>
				typing frames: {buildTypingFrames(post.history).length}
			</Text>

			{confirmDelete ? (
				<>
					<Alert variant="warning" title="Delete Post">
						この投稿を削除しますか?
					</Alert>
					<ConfirmInput
						onConfirm={() => {
							setPendingAction('投稿を削除しています...');
							void (async () => {
								try {
									await props.client.deletePost(post.id);
									props.onDeleted();
								} catch (deleteError) {
									props.onFlash({
										variant: 'error',
										message: toMessage(deleteError),
									});
									setConfirmDelete(false);
									setPendingAction(null);
								}
							})();
						}}
						onCancel={() => {
							setConfirmDelete(false);
						}}
					/>
				</>
			) : (
				<Select
					visibleOptionCount={8}
					options={actions}
					onChange={(value) => {
						if (value === 'back') {
							props.onBack();
							return;
						}

						if (value === 'author') {
							props.onOpenUser(String(post.authorId));
							return;
						}

						if (value === 'replay') {
							props.onReplay(post);
							return;
						}

						if (!props.currentUser) {
							props.onRequireLogin('この操作にはログインが必要です');
							return;
						}

						if (value === 'reply') {
							props.onReply(post.id);
							return;
						}

						if (value === 'reaction') {
							props.onReact(post.id);
							return;
						}

						if (value === 'delete') {
							setConfirmDelete(true);
							return;
						}

						if (value === 'love' || value === 'boost') {
							setPendingAction(
								value === 'love'
									? 'Love を送っています...'
									: 'Boost を送っています...',
							);

							const task =
								value === 'love'
									? props.client.love(post.id)
									: props.client.boost(post.id);

							void (async () => {
								try {
									await task;
									props.onFlash({
										variant: 'success',
										message:
											value === 'love'
												? 'Love を送信しました'
												: 'Boost を送信しました',
									});
									setRefreshToken((token) => token + 1);
								} catch (actionError) {
									props.onFlash({
										variant: 'error',
										message: toMessage(actionError),
									});
								} finally {
									setPendingAction(null);
								}
							})();
						}
					}}
				/>
			)}
		</AppFrame>
	);
}

function ComposeScreen(props: {
	currentUser: KleismicUser | null;
	flash: FlashMessage | null;
	room?: string;
	replyToId?: number;
	onBack: () => void;
	onSubmit: (input: { room: string; text: string }) => Promise<void>;
}) {
	const [step, setStep] = useState<'room' | 'body' | 'confirm' | 'submitting'>(
		props.replyToId ? 'body' : 'room',
	);
	const [room, setRoom] = useState(props.room ?? DEFAULT_ROOM);
	const [draft, setDraft] = useState('');
	const [error, setError] = useState<string | null>(null);

	useInput((_input, key) => {
		if (key.escape && step !== 'submitting') {
			props.onBack();
		}
	});

	const decodedDraft = decodeComposerText(draft);

	return (
		<AppFrame
			title={props.replyToId ? `Reply / #${props.replyToId}` : 'Compose'}
			subtitle={
				props.replyToId ? '返信本文を入力します' : '投稿先と本文を入力します'
			}
			currentUser={props.currentUser}
			flash={props.flash}
			footer="Esc で戻る / 本文中の \\n は改行として送信"
		>
			{error ? <Alert variant="error">{error}</Alert> : null}

			{step === 'submitting' ? (
				<Spinner label="タイピングしながら送信しています..." />
			) : step === 'room' ? (
				<>
					<Text color={BRAND.secondary}>投稿先 room</Text>
					<TextInput
						defaultValue={room}
						placeholder="index"
						onChange={setRoom}
						onSubmit={(value) => {
							const nextRoom = (value.trim() || DEFAULT_ROOM).trim();
							const parsed = roomInputSchema.safeParse(nextRoom);

							if (!parsed.success) {
								setError('room 名を入力してください');
								return;
							}

							setRoom(parsed.data);
							setError(null);
							setStep('body');
						}}
					/>
				</>
			) : step === 'body' ? (
				<>
					<Text color={BRAND.secondary}>
						本文{' '}
						{props.replyToId
							? `(reply to #${props.replyToId})`
							: `(room: ${room})`}
					</Text>
					<TextInput
						placeholder="本文を入力"
						onChange={setDraft}
						onSubmit={(value) => {
							if (!value.trim()) {
								setError('本文を入力してください');
								return;
							}

							setDraft(value);
							setError(null);
							setStep('confirm');
						}}
					/>
				</>
			) : (
				<>
					<Text color={BRAND.secondary}>送信プレビュー</Text>
					<Box gap={1} flexWrap="wrap">
						<Badge color={BRAND.primary}>room {room}</Badge>
						{props.replyToId ? (
							<Badge color={BRAND.primary}>reply #{props.replyToId}</Badge>
						) : null}
					</Box>
					<Text color={BRAND.secondary} wrap="wrap">
						{decodedDraft}
					</Text>
					<ConfirmInput
						onConfirm={() => {
							setStep('submitting');
							void props
								.onSubmit({
									room,
									text: decodedDraft,
								})
								.catch((submitError) => {
									setError(toMessage(submitError));
									setStep('confirm');
								});
						}}
						onCancel={() => {
							setStep('body');
						}}
					/>
				</>
			)}
		</AppFrame>
	);
}

function ReactionScreen(props: {
	currentUser: KleismicUser | null;
	flash: FlashMessage | null;
	postId: number;
	onBack: () => void;
	onSubmit: (input: {
		text: string;
		size: number;
		color: string;
	}) => Promise<void>;
}) {
	const [step, setStep] = useState<
		'text' | 'size' | 'color' | 'confirm' | 'submitting'
	>('text');
	const [text, setText] = useState('祝');
	const [size, setSize] = useState('24');
	const [color, setColor] = useState<string>(BRAND.primary);
	const [error, setError] = useState<string | null>(null);

	useInput((_input, key) => {
		if (key.escape && step !== 'submitting') {
			props.onBack();
		}
	});

	return (
		<AppFrame
			title={`Reaction / #${props.postId}`}
			subtitle="text / size / color を順に入力します"
			currentUser={props.currentUser}
			flash={props.flash}
			footer="Esc で戻る"
		>
			{error ? <Alert variant="error">{error}</Alert> : null}

			{step === 'submitting' ? (
				<Spinner label="リアクションを送信しています..." />
			) : step === 'text' ? (
				<>
					<Text color={BRAND.secondary}>1 / 3: text</Text>
					<TextInput
						defaultValue={text}
						placeholder="祝"
						onChange={setText}
						onSubmit={(value) => {
							if (!value.trim()) {
								setError('text を入力してください');
								return;
							}

							setText(value.trim());
							setError(null);
							setStep('size');
						}}
					/>
				</>
			) : step === 'size' ? (
				<>
					<Text color={BRAND.secondary}>2 / 3: size</Text>
					<TextInput
						defaultValue={size}
						placeholder="24"
						onChange={setSize}
						onSubmit={(value) => {
							const parsed = reactionFormSchema.shape.size.safeParse(value);

							if (!parsed.success) {
								setError('size は 1 から 99 の整数で入力してください');
								return;
							}

							setSize(String(parsed.data));
							setError(null);
							setStep('color');
						}}
					/>
				</>
			) : step === 'color' ? (
				<>
					<Text color={BRAND.secondary}>3 / 3: color</Text>
					<TextInput
						defaultValue={color}
						placeholder="#10b981"
						onChange={setColor}
						onSubmit={(value) => {
							const parsed = reactionFormSchema.shape.color.safeParse(
								value.trim(),
							);

							if (!parsed.success) {
								setError(
									'color は #10b981 のような 16 進カラーで入力してください',
								);
								return;
							}

							setColor(parsed.data);
							setError(null);
							setStep('confirm');
						}}
					/>
				</>
			) : (
				<>
					<Box gap={1} flexWrap="wrap">
						<Badge color={color}>{text}</Badge>
						<Badge color={BRAND.primary}>size {size}</Badge>
						<Badge color={BRAND.primary}>color {color}</Badge>
					</Box>
					<ConfirmInput
						onConfirm={() => {
							const parsed = reactionFormSchema.safeParse({
								text,
								size,
								color,
							});

							if (!parsed.success) {
								setError('入力値を見直してください');
								return;
							}

							setError(null);
							setStep('submitting');
							void props.onSubmit(parsed.data).catch((submitError) => {
								setError(toMessage(submitError));
								setStep('confirm');
							});
						}}
						onCancel={() => {
							setStep('text');
						}}
					/>
				</>
			)}
		</AppFrame>
	);
}

function UserScreen(props: {
	client: KleismicClient;
	currentUser: KleismicUser | null;
	flash: FlashMessage | null;
	query: string;
	onBack: () => void;
	onOpenPost: (postId: number) => void;
}) {
	const [loading, setLoading] = useState(true);
	const [user, setUser] = useState<KleismicUser | null>(null);
	const [posts, setPosts] = useState<KleismicPost[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [refreshToken, setRefreshToken] = useState(0);

	useEffect(() => {
		let cancelled = false;

		void (async () => {
			setLoading(true);
			setError(null);

			try {
				const loadedUser = await loadUserByQuery(props.client, props.query);

				if (!loadedUser) {
					throw new Error('ユーザーが見つかりませんでした');
				}

				const loadedPosts = await props.client.getUserPosts(loadedUser.id);

				if (!cancelled) {
					setUser(loadedUser);
					setPosts(loadedPosts);
				}
			} catch (userError) {
				if (!cancelled) {
					setError(toMessage(userError));
				}
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [props.client, props.query, refreshToken]);

	useInput(
		(input) => {
			const normalized = input.toLowerCase();

			if (normalized === 'b') {
				props.onBack();
			}

			if (normalized === 'r') {
				setRefreshToken((token) => token + 1);
			}
		},
		{ isActive: !loading },
	);

	return (
		<AppFrame
			title={`User / ${props.query}`}
			subtitle="Enter で投稿詳細 / r で更新 / b で戻る"
			currentUser={props.currentUser}
			flash={props.flash}
		>
			{loading ? <Spinner label="ユーザー情報を取得しています..." /> : null}
			{error ? <Alert variant="error">{error}</Alert> : null}

			{!loading && !error && user ? (
				<>
					<Text color={BRAND.secondary} bold>
						{user.displayName || user.handleName}
					</Text>
					<Text color={BRAND.secondary} dimColor>
						@{user.handleName || user.id} /{' '}
						{formatDate(user.ampouleHistory.at(-1)?.date ?? null)}
					</Text>
					<Text color={BRAND.secondary} wrap="wrap">
						{user.bio || '(bio empty)'}
					</Text>
					<Box gap={1} flexWrap="wrap">
						<Badge color={BRAND.primary}>
							posts {prettyNumber(user.posts)}
						</Badge>
						<Badge color={BRAND.primary}>
							followers {prettyNumber(user.followers)}
						</Badge>
						<Badge color={BRAND.primary}>
							followees {prettyNumber(user.followees)}
						</Badge>
						<Badge color={BRAND.primary}>
							ampoule {user.ampoule.toFixed(1)}
						</Badge>
					</Box>

					{user.createdNests.length > 0 ? (
						<>
							<Text color={BRAND.secondary} bold>
								Nests
							</Text>
							<OrderedList>
								{user.createdNests.slice(0, 3).map((nest) => (
									<OrderedList.Item key={nest.id}>
										<Text color={BRAND.secondary}>
											{nest.displayName} / {nest.name}
										</Text>
									</OrderedList.Item>
								))}
							</OrderedList>
						</>
					) : null}

					{posts.length === 0 ? (
						<Alert variant="warning">
							このユーザーの投稿はまだありません。
						</Alert>
					) : (
						<Select
							visibleOptionCount={8}
							options={posts.slice(0, 20).map((post) => ({
								value: String(post.id),
								label: formatPostOption(post),
							}))}
							onChange={(value) => {
								props.onOpenPost(Number(value));
							}}
						/>
					)}
				</>
			) : null}
		</AppFrame>
	);
}

function NotificationsScreen(props: {
	client: KleismicClient;
	currentUser: KleismicUser | null;
	flash: FlashMessage | null;
	onBack: () => void;
	onOpenPost: (postId: number) => void;
}) {
	const [loading, setLoading] = useState(true);
	const [notifications, setNotifications] = useState<KleismicNotification[]>(
		[],
	);
	const [error, setError] = useState<string | null>(null);
	const [refreshToken, setRefreshToken] = useState(0);

	useEffect(() => {
		let cancelled = false;

		void (async () => {
			setLoading(true);
			setError(null);

			try {
				const nextNotifications = await props.client.getNotifications();

				if (!cancelled) {
					setNotifications(nextNotifications);
				}
			} catch (notificationError) {
				if (!cancelled) {
					setError(toMessage(notificationError));
				}
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [props.client, refreshToken]);

	useInput(
		(input) => {
			const normalized = input.toLowerCase();

			if (normalized === 'b') {
				props.onBack();
			}

			if (normalized === 'r') {
				setRefreshToken((token) => token + 1);
			}
		},
		{ isActive: !loading },
	);

	const unreadCount = notifications.filter((entry) => entry.state === 0).length;

	return (
		<AppFrame
			title="Notifications"
			subtitle="Enter で対象投稿を開く / r で更新 / b で戻る"
			currentUser={props.currentUser}
			flash={props.flash}
		>
			{loading ? <Spinner label="通知を取得しています..." /> : null}
			{error ? <Alert variant="error">{error}</Alert> : null}

			{!loading && !error ? (
				<>
					<Box gap={1} flexWrap="wrap">
						<Badge color={BRAND.primary}>total {notifications.length}</Badge>
						<Badge color={BRAND.primary}>unread {unreadCount}</Badge>
					</Box>

					{notifications.length === 0 ? (
						<Alert variant="warning">通知はありません。</Alert>
					) : (
						<Select
							visibleOptionCount={10}
							options={notifications.map((entry) => ({
								value: String(entry.postId ?? entry.targetId ?? 0),
								label: formatNotification(entry),
							}))}
							onChange={(value) => {
								const nextPostId = Number(value);

								if (nextPostId > 0) {
									props.onOpenPost(nextPostId);
								}
							}}
						/>
					)}
				</>
			) : null}
		</AppFrame>
	);
}

function TypingReplayScreen(props: {
	currentUser: KleismicUser | null;
	flash: FlashMessage | null;
	postId: number;
	history: string;
	onBack: () => void;
}) {
	const frames = buildTypingFrames(props.history);
	const [index, setIndex] = useState(0);

	useEffect(() => {
		if (frames.length <= 1 || index >= frames.length - 1) {
			return;
		}

		const timeout = setTimeout(() => {
			setIndex((current) => Math.min(current + 1, frames.length - 1));
		}, 70);

		return () => {
			clearTimeout(timeout);
		};
	}, [frames.length, index]);

	useInput((input) => {
		const normalized = input.toLowerCase();

		if (normalized === 'b') {
			props.onBack();
		}

		if (normalized === 'r') {
			setIndex(0);
		}
	});

	const progress =
		frames.length === 0 ? 100 : Math.round(((index + 1) / frames.length) * 100);

	return (
		<AppFrame
			title={`Typing Replay / #${props.postId}`}
			subtitle="r でリスタート / b で戻る"
			currentUser={props.currentUser}
			flash={props.flash}
		>
			<ProgressBar value={progress} />
			<Text color={BRAND.secondary} dimColor>
				frame {index + 1} / {frames.length}
			</Text>
			<Text color={BRAND.secondary} wrap="wrap">
				{frames[index] ?? ''}
			</Text>
			{index >= frames.length - 1 ? (
				<Alert variant="success" title="Replay Complete">
					タイピング履歴の再生が完了しました。
				</Alert>
			) : null}
		</AppFrame>
	);
}

async function loadUserByQuery(client: KleismicClient, query: string) {
	const cleaned = query.trim();

	if (/^\d+$/.test(cleaned)) {
		return client.getUserById(Number(cleaned));
	}

	return client.getUserByHandle(cleaned);
}

function formatPostOption(post: KleismicPost) {
	const roomSuffix =
		post.roomDisplayName || (post.room && post.room !== DEFAULT_ROOM)
			? ` / ${post.roomDisplayName ?? post.room}`
			: '';

	return `#${post.shortId} user#${post.authorId}${roomSuffix}  ${compact(post.content || '(empty)', 58)}`;
}

function formatNotification(entry: KleismicNotification) {
	const prefix = entry.state === 0 ? '[unread]' : '[read]';
	const body = compact(entry.message || entry.type || 'notification', 56);
	return `${prefix} ${entry.type || 'notify'} ${body}`;
}

function prettyNumber(value: number) {
	return new Intl.NumberFormat('ja-JP').format(value);
}

function compact(text: string, maxLength: number) {
	const normalized = text.replace(/\s+/g, ' ').trim();

	if (normalized.length <= maxLength) {
		return normalized;
	}

	return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
}

function formatDate(date: string | null) {
	if (!date) {
		return 'date unknown';
	}

	const parsedDate = new Date(date);

	if (Number.isNaN(parsedDate.getTime())) {
		return date;
	}

	return new Intl.DateTimeFormat('ja-JP', {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(parsedDate);
}

function toMessage(error: unknown) {
	if (error instanceof Error) {
		return error.message;
	}

	return '不明なエラーが発生しました';
}
