import type { ReactNode } from "react";
import { type ShopTheme, shopThemeVars } from "~/lib/shop-theme";
import { cn } from "~/lib/utils";

/**
 * Everything inside draws its shop surfaces from `var(--shop-*)`. Buying,
 * payment, verification badges and warnings never read these variables, so
 * they keep the platform's colours inside a shop too.
 */
export function ShopThemeScope({
	theme,
	className,
	children,
}: {
	theme: ShopTheme;
	className?: string;
	children: ReactNode;
}) {
	return (
		<div
			data-shop-theme={theme.brandColor}
			style={shopThemeVars(theme)}
			className={cn(className)}
		>
			{children}
		</div>
	);
}
