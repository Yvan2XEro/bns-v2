"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { Button } from "~/components/ui/button";
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
import type { DeliveryZone } from "../../../../../../api/src/payload-types";
import { ZoneFields } from "./zone-fields";

export interface ZoneDrawerTarget {
	zone: DeliveryZone | null;
	city: string;
}

/**
 * The zone form as a side panel beside the table rather than a modal, so the
 * other zones stay readable while one is edited. On a narrow screen the
 * column stacks below the table, hence the scroll on open.
 */
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
	const panel = useRef<HTMLElement>(null);

	// The caller keys the panel by zone, so this runs once per opened zone.
	useEffect(() => {
		panel.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
		panel.current?.focus({ preventScroll: true });
	}, []);

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
		<section
			ref={panel}
			tabIndex={-1}
			aria-labelledby="zone-panel-title"
			className="overflow-hidden rounded-2xl border border-[var(--shop-accent-border,var(--c-brand-tint-strong))] bg-surface shadow-[0_12px_32px_rgba(15,23,42,0.14)] outline-none"
		>
			<div className="flex items-center justify-between gap-2 border-subtle border-b px-[18px] py-3.5">
				<h2 id="zone-panel-title" className="font-bold text-base text-ink">
					{target.zone ? t("editZone") : t("addZone")}
				</h2>
				<button
					type="button"
					onClick={onClose}
					aria-label={t("cancel")}
					className="rounded-lg p-1 text-ink-muted hover:bg-subtle"
				>
					<X aria-hidden="true" className="h-[18px] w-[18px]" />
				</button>
			</div>
			<form onSubmit={onSubmit} className="space-y-4 px-[18px] py-4" noValidate>
				<ZoneFields form={form} />
				{formState.errors.root?.message && (
					<p role="alert" className="text-red-700 text-sm">
						{formState.errors.root.message}
					</p>
				)}
				<div className="flex gap-2.5">
					<Button
						type="button"
						variant="outline"
						className="min-h-11"
						onClick={onClose}
					>
						{t("cancel")}
					</Button>
					<Button type="submit" className="min-h-11 flex-1" disabled={pending}>
						{t("save")}
					</Button>
				</div>
			</form>
		</section>
	);
}
