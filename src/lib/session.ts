import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { z } from 'zod';
import { BASE_URL } from './constants.js';
import { cookieStoreSchema } from './cookies.js';

const storedSessionSchema = z.object({
	baseUrl: z.literal(BASE_URL),
	savedAt: z.string(),
	cookies: cookieStoreSchema,
	lastUser: z
		.object({
			id: z.number(),
			handleName: z.string().nullable().optional(),
			displayName: z.string().nullable().optional(),
		})
		.optional(),
});

type StoredSession = z.infer<typeof storedSessionSchema>;

function getAppDataDirectory() {
	if (process.platform === 'win32') {
		return join(
			process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'),
			'kongyo2',
			'kleismic-cli',
		);
	}

	if (process.platform === 'darwin') {
		return join(
			homedir(),
			'Library',
			'Application Support',
			'kongyo2',
			'kleismic-cli',
		);
	}

	return join(
		process.env.XDG_STATE_HOME ?? join(homedir(), '.local', 'state'),
		'kongyo2',
		'kleismic-cli',
	);
}

function getSessionFilePath() {
	return join(getAppDataDirectory(), 'session.json');
}

export async function loadSession() {
	try {
		const raw = await readFile(getSessionFilePath(), 'utf8');
		return storedSessionSchema.parse(JSON.parse(raw));
	} catch {
		return null;
	}
}

export async function saveSession(session: StoredSession) {
	const filePath = getSessionFilePath();
	await mkdir(dirname(filePath), { recursive: true });
	await writeFile(filePath, JSON.stringify(session, null, 2), 'utf8');
	return filePath;
}

export async function clearSession() {
	try {
		await unlink(getSessionFilePath());
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
			throw error;
		}
	}
}
