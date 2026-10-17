"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ListError, ListLoading } from "~/components/moderation/console-parts";
import { ShopSheet } from "~/components/moderation/shop-sheet";
import { useAuth } from "~/hooks/use-auth";
import { useModerationShopSheet } from "~/hooks/use-moderation-shops";

export function ShopSheetClient({ id }: { id: string }) {
	const t = useTranslations("ModerationConsole");
	const { user } = useAuth();
	const sheet = useModerationShopSheet(id);
	return (
		<div className="space-y-4">
			<Link
				href="/moderation/shops"
				className="inline-flex items-center gap-1.5 rounded font-medium text-ink-soft text-sm hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
			>
				<ArrowLeft aria-hidden="true" className="h-4 w-4" />
				{t("shop.back")}
			</Link>
			{sheet.isPending ? (
				<ListLoading label={t("shop.loading")} />
			) : sheet.isError || !sheet.data ? (
				<ListError
					error={sheet.error}
					fallback={t("shop.loadError")}
					onRetry={() => void sheet.refetch()}
				/>
			) : (
				<ShopSheet
					sheet={sheet.data}
					viewer={{ id: user?.id ?? null, role: user?.role ?? null }}
				/>
			)}
		</div>
	);
}
