import { defaultTheme, extendTheme } from '@inkjs/ui';
import { BRAND } from './constants.js';

const warningColor = '#f59e0b';
const errorColor = '#ef4444';

function colorByVariant(variant: 'info' | 'success' | 'warning' | 'error') {
	if (variant === 'warning') {
		return warningColor;
	}

	if (variant === 'error') {
		return errorColor;
	}

	return BRAND.primary;
}

export const kleismicTheme = extendTheme(defaultTheme, {
	components: {
		Spinner: {
			styles: {
				frame: () => ({
					color: BRAND.primary,
				}),
				label: () => ({
					color: BRAND.secondary,
				}),
			},
		},
		Select: {
			styles: {
				selectedIndicator: () => ({
					color: BRAND.primary,
				}),
				focusIndicator: () => ({
					color: BRAND.primary,
				}),
				label: ({
					isFocused,
					isSelected,
				}: { isFocused?: boolean; isSelected?: boolean } = {}) => ({
					color: isFocused
						? BRAND.secondary
						: isSelected
							? BRAND.primary
							: undefined,
					bold: Boolean(isFocused || isSelected),
				}),
				highlightedText: () => ({
					bold: true,
					color: BRAND.primary,
				}),
			},
		},
		ProgressBar: {
			styles: {
				completed: () => ({
					color: BRAND.primary,
				}),
				remaining: () => ({
					color: BRAND.accent,
					dimColor: true,
				}),
			},
		},
		StatusMessage: {
			styles: {
				icon: ({
					variant,
				}: {
					variant: 'info' | 'success' | 'warning' | 'error';
				}) => ({
					color: colorByVariant(variant),
				}),
				message: () => ({
					color: BRAND.secondary,
				}),
			},
		},
		Alert: {
			styles: {
				container: ({
					variant,
				}: {
					variant: 'info' | 'success' | 'warning' | 'error';
				}) => ({
					flexGrow: 1,
					borderStyle: 'round',
					borderColor: colorByVariant(variant),
					gap: 1,
					paddingX: 1,
				}),
				iconContainer: () => ({
					flexShrink: 0,
				}),
				icon: ({
					variant,
				}: {
					variant: 'info' | 'success' | 'warning' | 'error';
				}) => ({
					color: colorByVariant(variant),
				}),
				content: () => ({
					flexShrink: 1,
					flexGrow: 1,
					minWidth: 0,
					flexDirection: 'column',
					gap: 1,
				}),
				title: () => ({
					bold: true,
					color: BRAND.secondary,
				}),
				message: () => ({
					color: BRAND.secondary,
				}),
			},
		},
	},
});
