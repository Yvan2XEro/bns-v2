"use client";

import { type ReactNode, useEffect } from "react";
import { type ShopTheme, shopThemeVars } from "~/lib/shop-theme";

/**
 * The seller dashboard in the shop's colours. The wrapper paints the first
 * render; the same variables go on <body> while the dashboard is open so the
 * dialogs and menus it portals there match.
 */
export function SellerTheme({
	theme,
	children,
}: {
	theme: ShopTheme | null;
	children: ReactNode;
}) {
	useEffect(() => {
		if (!theme) return;
		const body = document.body;
		const vars = Object.entries(shopThemeVars(theme)) as [string, string][];
		for (const [name, value] of vars) body.style.setProperty(name, value);
		body.dataset.shopTheme = theme.brandColor;
		body.dataset.sellerTheme = "";
		return () => {
			for (const [name] of vars) body.style.removeProperty(name);
			delete body.dataset.shopTheme;
			delete body.dataset.sellerTheme;
		};
	}, [theme]);

	if (!theme) return <>{children}</>;
	return (
		<div
			data-shop-theme={theme.brandColor}
			data-seller-theme=""
			style={shopThemeVars(theme)}
		>
			{children}
		</div>
	);
}
