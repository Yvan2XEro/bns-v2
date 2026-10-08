"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Scale } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useFieldArray, useForm } from "react-hook-form";
import type { z } from "zod";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { useOpenDispute } from "~/hooks/use-disputes";
import { usePurchase } from "~/hooks/use-purchases";
import {
	disputeProblemSchema,
	toOpenDisputePayload,
} from "~/lib/dispute-problem";

type FormInput = z.input<typeof disputeProblemSchema>;
type FormOutput = z.output<typeof disputeProblemSchema>;

export function ProblemReportClient({ orderId }: { orderId: string }) {
	const t = useTranslations("Disputes");
	const router = useRouter();
	const purchase = usePurchase(orderId);
	const mutation = useOpenDispute(orderId);

	if (purchase.isPending) return <LoadingRows />;
	if (purchase.isError)
		return (
			<main className="mx-auto max-w-3xl px-4 py-10">
				<LoadError
					title={t("detailLoadError")}
					onRetry={() => void purchase.refetch()}
				/>
			</main>
		);
	return (
		<ProblemReportForm
			order={purchase.data}
			onSubmit={(input) =>
				mutation.mutate(toOpenDisputePayload(input), {
					onSuccess: (result) =>
						router.push(`/disputes/${encodeURIComponent(result.id)}`),
				})
			}
			pending={mutation.isPending}
			error={mutation.isError}
		/>
	);
}

function ProblemReportForm({
	order,
	onSubmit,
	pending,
	error,
}: {
	order: NonNullable<ReturnType<typeof usePurchase>["data"]>;
	onSubmit: (input: FormOutput) => void;
	pending: boolean;
	error: boolean;
}) {
	const t = useTranslations("Disputes");
	const form = useForm<FormInput, unknown, FormOutput>({
		resolver: zodResolver(disputeProblemSchema),
		defaultValues: {
			reason: "not_as_described",
			subject: "goods",
			description: "",
			requestedOutcome: "return_and_refund",
			items: order.items.map((item) => ({ orderItemId: item.id, quantity: 0 })),
		},
	});
	const fields = useFieldArray({ control: form.control, name: "items" });
	const selectedItems = form.watch("items");

	return (
		<main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
			<Link
				href={`/purchases/${encodeURIComponent(order.id)}`}
				className="inline-flex min-h-11 items-center gap-2 text-[#1E40AF] text-sm"
			>
				<ArrowLeft aria-hidden="true" className="h-4 w-4" />
				{t("backToOrder")}
			</Link>
			<header className="flex items-start gap-3 rounded-2xl border border-[#DDD6FE] bg-gradient-to-br from-[#FAF9FF] to-white p-5">
				<Scale aria-hidden="true" className="mt-1 h-5 w-5 text-[#6D28D9]" />
				<div>
					<p className="text-[#64748B] text-sm">
						{t("orderNumber", { number: order.orderNumber })}
					</p>
					<h1 className="mt-1 font-bold text-2xl text-[#0F172A]">
						{t("reportTitle")}
					</h1>
					<p className="mt-1 text-[#64748B] text-sm">{t("reviewTerms")}</p>
				</div>
			</header>
			<form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
				<section className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
					<h2 className="font-semibold text-[#0F172A]">{t("selectItems")}</h2>
					<div className="mt-3 divide-y divide-[#E2E8F0]">
						{fields.fields.map((field, index) => (
							<label
								key={field.id}
								className="flex min-h-16 items-center justify-between gap-4 py-3"
							>
								<span className="min-w-0">
									<span className="block truncate font-medium text-[#0F172A]">
										{order.items[index]?.title}
									</span>
									<span className="text-[#64748B] text-xs">
										{order.items[index]?.quantity} {t("purchased")}
									</span>
								</span>
								<input
									aria-label={t("quantityFor", {
										item: order.items[index]?.title ?? "",
									})}
									type="number"
									min={0}
									max={order.items[index]?.quantity}
									{...form.register(`items.${index}.quantity`, {
										valueAsNumber: true,
									})}
									className="min-h-11 w-24 rounded-lg border border-[#CBD5E1] px-3 text-right"
								/>
							</label>
						))}
					</div>
					{selectedItems?.every((item) => item.quantity < 1) &&
					form.formState.isSubmitted ? (
						<p role="alert" className="mt-2 text-red-700 text-sm">
							{t("selectAtLeastOne")}
						</p>
					) : null}
				</section>
				<section className="grid gap-4 rounded-2xl border border-[#E2E8F0] bg-white p-5 sm:grid-cols-2">
					<label className="space-y-1.5 text-sm">
						<span className="font-medium text-[#334155]">
							{t("reasonLabel")}
						</span>
						<select
							{...form.register("reason")}
							className="min-h-11 w-full rounded-lg border border-[#CBD5E1] bg-white px-3"
						>
							{(
								[
									"not_received",
									"not_as_described",
									"damaged",
									"counterfeit",
									"wrong_item",
									"seller_no_show",
									"cod_refused_abuse",
								] as const
							).map((reason) => (
								<option key={reason} value={reason}>
									{t(`reason.${reason}`)}
								</option>
							))}
						</select>
					</label>
					<label className="space-y-1.5 text-sm">
						<span className="font-medium text-[#334155]">
							{t("outcomeLabel")}
						</span>
						<select
							{...form.register("requestedOutcome")}
							className="min-h-11 w-full rounded-lg border border-[#CBD5E1] bg-white px-3"
						>
							{(
								[
									"full_refund",
									"partial_refund",
									"return_and_refund",
									"no_refund",
								] as const
							).map((outcome) => (
								<option key={outcome} value={outcome}>
									{t(`outcome.${outcome}`)}
								</option>
							))}
						</select>
					</label>
					<label className="space-y-1.5 text-sm sm:col-span-2">
						<span className="font-medium text-[#334155]">
							{t("descriptionLabel")}
						</span>
						<textarea
							rows={5}
							maxLength={2000}
							{...form.register("description")}
							className="w-full rounded-xl border border-[#CBD5E1] p-3"
						/>
						{form.formState.errors.description ? (
							<span role="alert" className="block text-red-700">
								{t("descriptionError")}
							</span>
						) : null}
					</label>
				</section>
				<p className="text-[#64748B] text-xs">{t("reviewTerms")}</p>
				{error ? (
					<p role="alert" className="text-red-700 text-sm">
						{t("actionError")}
					</p>
				) : null}
				<button
					type="submit"
					disabled={pending}
					className="min-h-11 rounded-xl bg-[#5B21B6] px-5 font-semibold text-sm text-white disabled:opacity-50"
				>
					{t("submitReport")}
				</button>
			</form>
		</main>
	);
}
