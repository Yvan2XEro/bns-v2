import type { Metadata } from "next";
import { ShopSheetClient } from "./shop-sheet-client";

export const metadata: Metadata = { title: "Shop sheet" };

export default async function ShopSheetPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	return <ShopSheetClient id={id} />;
}
