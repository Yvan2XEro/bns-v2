"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { useCreateZone, useUpdateZone } from "~/hooks/use-delivery-settings";
import { resolveErrorMessage } from "~/lib/apiError";
import {
	emptyZoneForm,
	type ZoneFormValues,
	zoneFormSchema,
	zoneServerError,
	zoneToForm,
	zoneToInput,
} from "~/lib/delivery-zone-form";
import type { DeliveryZone } from "../../../../../api/src/payload-types";
import { ZoneFields } from "./zone-fields";

export interface ZoneDrawerTarget {
	zone: DeliveryZone | null;
	city: string;
}

export function ZoneDrawer({
	shopId,
	target,
	onClose,
}: {
	shopId: string;
	target: ZoneDrawerTarget;
	onClose: () => void;
}) {
	const t = useTranslations("SellerDelivery");
	const tRoot = useTranslations();
	const create = useCreateZone(shopId);
	const update = useUpdateZone(shopId);
	const form = useForm<ZoneFormValues>({
		resolver: zodResolver(zoneFormSchema),
		defaultValues: target.zone
			? zoneToForm(target.zone)
			: emptyZoneForm(target.city),
	});
	const { handleSubmit, setError, formState } = form;
	const pending = create.isPending || update.isPending;

	const onSubmit = handleSubmit(async (values) => {
		const input = zoneToInput(values);
		try {
			if (target.zone) {
				await update.mutateAsync({ zoneId: target.zone.id, input });
			} else {
				await create.mutateAsync(input);
			}
			onClose();
		} catch (error) {
			const code =
				error && typeof error === "object" && "code" in error
					? String(error.code)
					: "";
			const mapped = zoneServerError(code);
			if (mapped) {
				setError(mapped.field, { message: mapped.message });
			} else {
				setError("root", { message: resolveErrorMessage(error, tRoot) });
			}
		}
	});

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>
						{target.zone ? t("editZone") : t("addZone")}
					</DialogTitle>
				</DialogHeader>
				<form onSubmit={onSubmit} className="space-y-4" noValidate>
					<ZoneFields form={form} />
					{formState.errors.root?.message && (
						<p role="alert" className="text-red-700 text-sm">
							{formState.errors.root.message}
						</p>
					)}
					<div className="flex justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							className="min-h-11"
							onClick={onClose}
						>
							{t("cancel")}
						</Button>
						<Button type="submit" className="min-h-11" disabled={pending}>
							{t("save")}
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
