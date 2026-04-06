import { z } from 'zod';

export const cookieStoreSchema = z.record(z.string(), z.string());

export class CookieStore {
	private readonly cookies = new Map<string, string>();

	constructor(initial?: Record<string, string>) {
		for (const [name, value] of Object.entries(initial ?? {})) {
			if (value) {
				this.cookies.set(name, value);
			}
		}
	}

	load(nextCookies: Record<string, string>) {
		this.cookies.clear();

		for (const [name, value] of Object.entries(nextCookies)) {
			if (value) {
				this.cookies.set(name, value);
			}
		}
	}

	clear() {
		this.cookies.clear();
	}

	toHeader() {
		return Array.from(this.cookies.entries())
			.map(([name, value]) => `${name}=${value}`)
			.join('; ');
	}

	toObject() {
		return Object.fromEntries(this.cookies.entries());
	}

	ingest(setCookieHeaders: string[] | string | null | undefined) {
		const values = Array.isArray(setCookieHeaders)
			? setCookieHeaders
			: setCookieHeaders
				? [setCookieHeaders]
				: [];

		for (const header of values) {
			const firstChunk = header.split(';')[0];
			const separatorIndex = firstChunk.indexOf('=');

			if (separatorIndex <= 0) {
				continue;
			}

			const name = firstChunk.slice(0, separatorIndex).trim();
			const value = firstChunk.slice(separatorIndex + 1).trim();

			if (name && value) {
				this.cookies.set(name, value);
			}
		}
	}
}
