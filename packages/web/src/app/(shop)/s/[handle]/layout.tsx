import { permanentRedirect } from "next/navigation";
import { PublicFrame } from "~/components/layout/public-frame";
import { ShopThemeScope } from "~/components/shop/shop-theme-scope";
import { lookupShop } from "~/lib/server-shop";
import { shopTheme } from "~/lib/shop-theme";

/**
 * The shop routes live in their own group so the global header renders once,
 * in shop mode, with the shop's colours around the whole page. An unknown
 * handle still gets the plain frame: the page's notFound() then renders this
 * segment's not-found inside it, header and footer included.
 */
export default async function ShopLayout({
	children,
	params,
}: {
	children: React.ReactNode;
	params: Promise<{ handle: string }>;
}) {
	const { handle } = await params;
	const result = await lookupShop(handle);
	if (result && "redirectTo" in result) {
		permanentRedirect(`/s/${result.redirectTo}`);
	}
	const shop = result?.shop ?? null;
	if (!shop) return <PublicFrame>{children}</PublicFrame>;

	const theme = shopTheme(shop.brandColor);
	return (
		<ShopThemeScope theme={theme}>
			<PublicFrame
				shop={{
					name: shop.name,
					handle: shop.handle,
					logoUrl: shop.logo?.url ?? null,
					theme,
				}}
			>
				{children}
			</PublicFrame>
		</ShopThemeScope>
	);
}
