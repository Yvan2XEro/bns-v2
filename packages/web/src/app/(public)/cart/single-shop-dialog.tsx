"use client";

import { useTranslations } from "next-intl";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import type { SingleShopConflict } from "~/lib/cart-lines";

/**
 * Shown when an add is refused with `cart.singleShop`. Replacing re-sends the
 * same add with `replace: true`, which empties the cart server-side first;
 * keeping drops the add and leaves the cart as it is.
 */
export function SingleShopDialog({
	conflict,
	replacing,
	onReplace,
	onKeep,
}: {
	conflict: SingleShopConflict | null;
	replacing: boolean;
	onReplace: () => void;
	onKeep: () => void;
}) {
	const t = useTranslations("Cart");
	const shopName = conflict?.currentShop?.name;

	return (
		<Dialog
			open={conflict !== null}
			onOpenChange={(open) => {
				if (!open && !replacing) onKeep();
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("singleShopTitle")}</DialogTitle>
					<DialogDescription>
						{shopName
							? t("singleShopBodyNamed", { shop: shopName })
							: t("singleShopBody")}
					</DialogDescription>
				</DialogHeader>
				<DialogFooter className="gap-2">
					<Button
						type="button"
						variant="outline"
						className="min-h-11"
						disabled={replacing}
						onClick={onKeep}
					>
						{t("singleShopKeep")}
					</Button>
					<Button
						type="button"
						className="min-h-11"
						disabled={replacing}
						onClick={onReplace}
					>
						{t("singleShopReplace")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
