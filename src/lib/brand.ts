import { renderFilled } from 'oh-my-logo';
import { APP_NAME, APP_TAGLINE, APP_WELCOME, BRAND } from './constants.js';

type BootLogoOptions = {
	enabled: boolean;
};

export async function showBootLogo({ enabled }: BootLogoOptions) {
	if (!enabled || !process.stdout.isTTY) {
		return;
	}

	try {
		await renderFilled(APP_NAME.toUpperCase(), {
			palette: [BRAND.primary, BRAND.secondary, BRAND.accent],
			font: 'block',
			letterSpacing: 0,
		});

		console.log('');
		console.log(APP_WELCOME);
		console.log(APP_TAGLINE);
		console.log('');
	} catch {
		console.log(`${APP_NAME}\n${APP_TAGLINE}\n`);
	}
}
