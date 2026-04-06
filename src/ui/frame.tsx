import { Badge, StatusMessage } from '@inkjs/ui';
import { Box, Text } from 'ink';
import type { ReactNode } from 'react';
import type { KleismicUser } from '../lib/api.js';
import { APP_NAME, APP_WELCOME, BRAND } from '../lib/constants.js';

type FlashMessage = {
	variant: 'info' | 'success' | 'warning' | 'error';
	message: string;
};

type AppFrameProps = {
	title: string;
	subtitle?: string;
	currentUser: KleismicUser | null;
	flash: FlashMessage | null;
	children: ReactNode;
	footer?: ReactNode;
};

export function AppFrame({
	title,
	subtitle,
	currentUser,
	flash,
	children,
	footer,
}: AppFrameProps) {
	return (
		<Box flexDirection="column" paddingX={1} gap={1}>
			<Box
				flexDirection="column"
				borderStyle="round"
				borderColor={BRAND.primary}
				paddingX={1}
			>
				<Box justifyContent="space-between">
					<Text color={BRAND.secondary} bold>
						{APP_NAME} / {title}
					</Text>
					<Badge color={currentUser ? BRAND.primary : warningBadgeColor}>
						{currentUser
							? `signed in: ${currentUser.displayName || currentUser.handleName}`
							: 'guest'}
					</Badge>
				</Box>
				<Text color={BRAND.secondary} dimColor>
					{subtitle ?? APP_WELCOME}
				</Text>
			</Box>

			{flash ? (
				<StatusMessage variant={flash.variant}>{flash.message}</StatusMessage>
			) : null}

			<Box
				flexDirection="column"
				borderStyle="round"
				borderColor={BRAND.accent}
				paddingX={1}
				gap={1}
			>
				{children}
			</Box>

			{footer ? (
				<Box>
					<Text color={BRAND.secondary} dimColor>
						{footer}
					</Text>
				</Box>
			) : null}
		</Box>
	);
}

const warningBadgeColor = '#f59e0b';
