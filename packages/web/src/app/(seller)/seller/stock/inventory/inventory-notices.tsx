"use client";

import { useTranslations } from "next-intl";

/** The three banners the count screen can show: a notice, an invalid-row count, or a server refusal. */
export function InventoryNotices({
	notice,
	invalidRows,
	errorMessage,
}: {
	notice: string | null;
	invalidRows: number;
	errorMessage: string | null;
}) {
	const t = useTranslations("Inventory");

	return (
		<>
			{notice && (
				<p className="rounded-lg bg-[#F0FDF4] px-3 py-2 text-[#166534] text-sm">
					{notice}
				</p>
			)}
			{invalidRows > 0 && (
				<p
					role="alert"
					className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800 text-sm"
				>
					{t("invalidRows", { count: invalidRows })}
				</p>
			)}
			{errorMessage && (
				<p
					role="alert"
					className="rounded-lg bg-red-50 px-3 py-2 text-red-700 text-sm"
				>
					{errorMessage}
				</p>
			)}
		</>
	);
}
