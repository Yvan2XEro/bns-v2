"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MessageSquareText, Scale } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { useDispute, useDisputeAction } from "~/hooks/use-disputes";
import {
	DISPUTE_REASON_LABELS,
	DISPUTE_STATUS_LABELS,
} from "~/lib/case-status";
import { disputeActionGroups } from "~/lib/dispute-flow";
import { caseKeys } from "~/lib/query-keys";
import { apiPost } from "~/lib/shop-api";

const messageSchema = z.object({ body: z.string().trim().min(1).max(2000) });
type MessageInput = z.infer<typeof messageSchema>;
const ACTIONS = [
	"submit",
	"withdraw",
	"escalate",
	"respond_accept",
	"proposal_accept",
	"proposal_reject",
] as const;

export function DisputeThreadClient({ disputeId }: { disputeId: string }) {
	const t = useTranslations("Disputes");
	const locale = useLocale();
	const queryClient = useQueryClient();
	const query = useDispute(disputeId);
	const action = useDisputeAction(disputeId);
	const form = useForm<MessageInput>({
		resolver: zodResolver(messageSchema),
		defaultValues: { body: "" },
	});
	const sendMessage = useMutation({
		mutationFn: (input: MessageInput) =>
			apiPost(`/api/disputes/${encodeURIComponent(disputeId)}/messages`, input),
		onSuccess: async () => {
			form.reset();
			await queryClient.invalidateQueries({
				queryKey: caseKeys.disputeDetail(disputeId),
			});
		},
	});

	if (query.isPending) return <LoadingRows />;
	if (query.isError || !query.data) {
		return (
			<main className="mx-auto max-w-4xl px-4 py-12">
				<LoadError
					title={t("detailLoadError")}
					onRetry={() => void query.refetch()}
				/>
			</main>
		);
	}

	const view = query.data;
	const groups = disputeActionGroups(view.allowedActions);
	const available = ACTIONS.filter((name) => groups.response.includes(name));
	const submitAction = (name: (typeof ACTIONS)[number]) => {
		const body =
			name === "respond_accept"
				? { action: "accept" }
				: name === "proposal_accept" || name === "proposal_reject"
					? { action: name === "proposal_accept" ? "accept" : "reject" }
					: undefined;
		action.mutate({ action: name, body });
	};

	return (
		<main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
			<Link
				href="/account/disputes"
				className="inline-flex min-h-11 items-center gap-2 text-[#5B21B6] text-sm hover:underline"
			>
				<ArrowLeft aria-hidden="true" className="h-4 w-4" />
				{t("back")}
			</Link>
			<header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-[#DDD6FE] bg-gradient-to-br from-[#FAF9FF] to-white p-5">
				<div className="flex items-start gap-3">
					<Scale aria-hidden="true" className="mt-1 h-5 w-5 text-[#6D28D9]" />
					<div>
						<p className="text-[#64748B] text-sm">
							{t("orderNumber", { number: view.orderNumber })}
						</p>
						<h1 className="mt-1 font-bold text-2xl text-[#0F172A]">
							{t("case", { number: view.number })}
						</h1>
						<p className="mt-1 text-[#475569] text-sm">
							{t(DISPUTE_REASON_LABELS[view.reason])}
						</p>
					</div>
				</div>
				<span className="rounded-full bg-white px-3 py-1.5 font-semibold text-[#5B21B6] text-sm">
					{t(DISPUTE_STATUS_LABELS[view.status])}
				</span>
			</header>
			<section className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
				<p className="font-semibold text-[#0F172A]">
					{t("amountAtStake", {
						amount: view.amountAtStake.toLocaleString(locale),
					})}
				</p>
				{view.deadlines.respondBy ? (
					<p className="mt-2 text-[#64748B] text-sm">
						{t("deadline", {
							date: new Intl.DateTimeFormat(locale, {
								dateStyle: "medium",
								timeStyle: "short",
							}).format(new Date(view.deadlines.respondBy)),
						})}
					</p>
				) : null}
				{view.resolution ? (
					<div className="mt-4 rounded-xl bg-emerald-50 p-4 text-emerald-950">
						<h2 className="font-semibold">{t("resolution")}</h2>
						<p className="mt-1 text-sm">
							{view.resolution.publicStatement[locale === "fr" ? "fr" : "en"]}
						</p>
						<p className="mt-2 font-semibold text-sm">
							{t("refundAmount", {
								amount: view.resolution.refundAmount.toLocaleString(locale),
							})}
						</p>
					</div>
				) : null}
			</section>
			<section className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
				<div className="flex items-center gap-2">
					<MessageSquareText
						aria-hidden="true"
						className="h-4 w-4 text-[#6D28D9]"
					/>
					<h2 className="font-semibold text-[#0F172A]">{t("messages")}</h2>
				</div>
				{view.messages.length ? (
					<ol className="mt-4 space-y-3">
						{view.messages.map((entry) => (
							<li key={entry.id} className="rounded-xl bg-[#F8FAFC] p-4">
								<p className="whitespace-pre-wrap text-[#334155] text-sm">
									{entry.redacted ? t("redacted") : entry.body}
								</p>
								<time
									className="mt-2 block text-[#64748B] text-xs"
									dateTime={entry.at}
								>
									{new Intl.DateTimeFormat(locale, {
										dateStyle: "medium",
										timeStyle: "short",
									}).format(new Date(entry.at))}
								</time>
							</li>
						))}
					</ol>
				) : (
					<p className="mt-4 text-[#64748B] text-sm">{t("noMessages")}</p>
				)}
				{groups.conversation.includes("message") ? (
					<form
						className="mt-5 space-y-2"
						onSubmit={form.handleSubmit((input) => sendMessage.mutate(input))}
					>
						<label
							htmlFor="dispute-message"
							className="block font-medium text-[#334155] text-sm"
						>
							{t("messageLabel")}
						</label>
						<textarea
							id="dispute-message"
							rows={3}
							maxLength={2000}
							{...form.register("body")}
							className="w-full rounded-xl border border-[#CBD5E1] p-3 text-sm focus:border-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-[#DDD6FE]"
						/>
						{form.formState.errors.body ? (
							<p role="alert" className="text-red-700 text-sm">
								{t("messageRequired")}
							</p>
						) : null}
						<button
							type="submit"
							disabled={sendMessage.isPending}
							className="min-h-11 rounded-xl bg-[#5B21B6] px-4 font-semibold text-sm text-white disabled:opacity-50"
						>
							{t("sendMessage")}
						</button>
						{sendMessage.isError ? (
							<p role="alert" className="text-red-700 text-sm">
								{t("actionError")}
							</p>
						) : null}
					</form>
				) : null}
			</section>
			{view.proposal?.status === "open" ? (
				<section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
					<h2 className="font-semibold text-amber-950">{t("proposal")}</h2>
					<p className="mt-2 text-amber-900 text-sm">
						{t("proposedAmount", {
							amount: view.proposal.amount.toLocaleString(locale),
						})}
					</p>
				</section>
			) : null}
			{available.length ? (
				<section className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
					<h2 className="font-semibold text-[#0F172A]">{t("actions")}</h2>
					<div className="mt-3 flex flex-wrap gap-2">
						{available.map((name) => (
							<button
								key={name}
								type="button"
								disabled={action.isPending}
								onClick={() => submitAction(name)}
								className="min-h-11 rounded-xl border border-[#CBD5E1] px-4 font-medium text-[#1E293B] text-sm hover:bg-[#F8FAFC] disabled:opacity-50"
							>
								{t(name)}
							</button>
						))}
					</div>
					{action.isError ? (
						<p role="alert" className="mt-3 text-red-700 text-sm">
							{t("actionError")}
						</p>
					) : null}
				</section>
			) : null}
		</main>
	);
}
