"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useReducer } from "react";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { useDecideResaleLink, useResaleLinks } from "~/hooks/use-resale";
import { resolveErrorMessage } from "~/lib/apiError";
import type { ResaleLinkListItem } from "../../../../../../api/src/contracts/resale";

type Side = "supplier" | "reseller";
type Filter = "all" | "requested" | "approved" | "suspended" | "revoked";
type Reason = "quality" | "pricing" | "fraud_review" | "terms" | "other";
interface State {
	filter: Filter;
	reason: Reason;
	note: string;
}
function reducer(state: State, patch: Partial<State>): State {
	return { ...state, ...patch };
}

export function ResaleLinksClient({
	shopId,
	side,
}: {
	shopId: string;
	side: Side;
}) {
	const t = useTranslations("SellerResaleLinks");
	const tRoot = useTranslations();
	const [state, patch] = useReducer(reducer, {
		filter: "all",
		reason: "quality",
		note: "",
	});
	const links = useResaleLinks(shopId, side, state.filter);
	const decide = useDecideResaleLink(shopId);
	const requestCount =
		links.data?.docs.filter((link) => link.status === "requested").length ?? 0;
	const error = links.error ?? decide.error;
	const errorMessage = error
		? resolveErrorMessage(error, tRoot, t("actionFailed"))
		: null;
	const run = (
		link: ResaleLinkListItem,
		action: "approve" | "decline" | "suspend" | "reinstate" | "revoke",
	) => {
		if (
			(action === "revoke" || action === "decline") &&
			!window.confirm(t("confirmDecision"))
		)
			return;
		decide.mutate({
			linkId: link.id,
			action,
			...(action === "suspend"
				? { reason: state.reason, note: state.note.trim() || undefined }
				: {}),
			...(action !== "suspend" && state.note.trim()
				? { note: state.note.trim() }
				: {}),
		});
	};

	return (
		<section className="space-y-6">
			<header className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<p className="font-semibold text-[#B45309] text-xs uppercase tracking-[0.18em]">
						BuyNSellem · Resale
					</p>
					<h1 className="mt-2 font-bold text-2xl text-[#0F172A]">
						{t(side === "supplier" ? "supplierTitle" : "resellerTitle")}
					</h1>
					<p className="mt-1 max-w-2xl text-[#64748B] text-sm">
						{t(
							side === "supplier"
								? "supplierDescription"
								: "resellerDescription",
						)}
					</p>
				</div>
				<nav aria-label={t("navigation")} className="flex flex-wrap gap-2">
					{side === "supplier" ? (
						<Link
							href="/seller/resale/offered"
							className="inline-flex min-h-11 items-center rounded-lg border border-[#E2E8F0] bg-white px-4 font-semibold text-[#334155] text-sm"
						>
							{t("offeredProducts")}
						</Link>
					) : null}
					<Link
						href={
							side === "supplier"
								? "/seller/resale/resellers"
								: "/seller/resale/suppliers"
						}
						aria-current="page"
						className="inline-flex min-h-11 items-center rounded-lg border border-[#B45309] bg-[#FFFBEB] px-4 font-semibold text-[#92400E] text-sm"
					>
						{t(side === "supplier" ? "supplierTitle" : "resellerTitle")}
					</Link>
					{side === "reseller" ? (
						<Link
							href="/seller/resale/catalogue"
							className="inline-flex min-h-11 items-center rounded-lg border border-[#E2E8F0] bg-white px-4 font-semibold text-[#334155] text-sm"
						>
							{t("catalogue")}
						</Link>
					) : null}
					<Link
						href="/seller/resale/purchase-orders"
						className="inline-flex min-h-11 items-center rounded-lg border border-[#E2E8F0] bg-white px-4 font-semibold text-[#334155] text-sm"
					>
						{t("purchaseOrders")}
					</Link>
				</nav>
			</header>
			<div className="flex flex-wrap items-center gap-3">
				<label className="grid gap-1 font-medium text-[#334155] text-sm">
					<span>{t("filter")}</span>
					<select
						value={state.filter}
						onChange={(event) => {
							const value = event.target.value;
							if (
								[
									"all",
									"requested",
									"approved",
									"suspended",
									"revoked",
								].includes(value)
							)
								patch({ filter: value as Filter });
						}}
						className="h-11 min-w-48 rounded-lg border border-[#CBD5E1] bg-white px-3"
					>
						{(
							["all", "requested", "approved", "suspended", "revoked"] as const
						).map((status) => (
							<option key={status} value={status}>
								{t(`filter_${status}`)}
							</option>
						))}
					</select>
				</label>
				{side === "supplier" && requestCount > 0 ? (
					<span className="rounded-full bg-amber-100 px-3 py-1.5 font-semibold text-amber-900 text-sm">
						{t("requestCount", { count: requestCount })}
					</span>
				) : null}
			</div>
			{errorMessage ? (
				<p
					role="alert"
					className="rounded-lg bg-red-50 p-3 text-red-800 text-sm"
				>
					{errorMessage}
				</p>
			) : null}
			{links.isPending ? <LoadingRows /> : null}
			{links.isError ? (
				<LoadError
					title={t("loadError")}
					onRetry={() => void links.refetch()}
				/>
			) : null}
			{links.data?.docs.length === 0 ? (
				<p className="rounded-2xl border border-[#CBD5E1] border-dashed bg-white px-6 py-14 text-center font-medium text-[#475569]">
					{t("empty")}
				</p>
			) : null}
			<div className="grid gap-4 xl:grid-cols-2">
				{links.data?.docs.map((link) => (
					<LinkCard
						key={link.id}
						link={link}
						side={side}
						t={t}
						pending={decide.isPending}
						onAction={(action) => run(link, action)}
						reason={state.reason}
						note={state.note}
						setReason={(reason) => patch({ reason })}
						setNote={(note) => patch({ note })}
					/>
				))}
			</div>
		</section>
	);
}

function LinkCard({
	link,
	side,
	t,
	pending,
	onAction,
	reason,
	note,
	setReason,
	setNote,
}: {
	link: ResaleLinkListItem;
	side: Side;
	t: ReturnType<typeof useTranslations<"SellerResaleLinks">>;
	pending: boolean;
	onAction: (
		action: "approve" | "decline" | "suspend" | "reinstate" | "revoke",
	) => void;
	reason: Reason;
	note: string;
	setReason: (reason: Reason) => void;
	setNote: (note: string) => void;
}) {
	const actionClass =
		"min-h-10 rounded-lg px-3 font-semibold text-sm disabled:opacity-50";
	return (
		<article className="space-y-4 rounded-2xl border border-[#E2E8F0] bg-white p-5">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2 className="font-bold text-[#0F172A]">{link.partnerShop.name}</h2>
					<p className="mt-1 text-[#64748B] text-sm">
						{link.partnerShop.handle
							? `@${link.partnerShop.handle}`
							: t("shopHandleUnavailable")}
					</p>
				</div>
				<span className="rounded-full bg-[#FEF3C7] px-3 py-1 font-semibold text-[#92400E] text-xs">
					{t(`status_${link.status}`)}
				</span>
			</div>
			{link.message ? (
				<p className="rounded-xl bg-[#F8FAFC] p-3 text-[#475569] text-sm">
					{link.message}
				</p>
			) : null}
			<dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
				<Metric
					value={link.stats.publishedListings}
					label={t("publishedListings")}
				/>
				<Metric
					value={link.stats.deliveredOrders30d}
					label={t("delivered30d")}
				/>
				<Metric
					value={link.stats.cancelledPurchaseOrders30d}
					label={t("cancelled30d")}
				/>
				<Metric
					value={link.stats.refusedDeliveries30d}
					label={t("refused30d")}
				/>
			</dl>
			{side === "supplier" ? (
				<div className="flex flex-wrap gap-2 border-[#E2E8F0] border-t pt-3">
					{link.status === "requested" ? (
						<>
							<input
								aria-label={t("decisionNote")}
								value={note}
								maxLength={1000}
								onChange={(event) => setNote(event.target.value)}
								placeholder={t("decisionNotePlaceholder")}
								className="h-10 min-w-48 rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm"
							/>
							<button
								type="button"
								disabled={pending}
								onClick={() => onAction("approve")}
								className={`${actionClass} bg-emerald-700 text-white`}
							>
								{t("approve")}
							</button>
							<button
								type="button"
								disabled={pending}
								onClick={() => onAction("decline")}
								className={`${actionClass} border border-red-200 text-red-700`}
							>
								{t("decline")}
							</button>
						</>
					) : null}
					{link.status === "approved" ? (
						<>
							<select
								aria-label={t("suspensionReason")}
								value={reason}
								onChange={(event) => {
									const value = event.target.value;
									if (
										[
											"quality",
											"pricing",
											"fraud_review",
											"terms",
											"other",
										].includes(value)
									)
										setReason(value as Reason);
								}}
								className="h-10 rounded-lg border border-[#CBD5E1] bg-white px-2 text-sm"
							>
								{(
									[
										"quality",
										"pricing",
										"fraud_review",
										"terms",
										"other",
									] as const
								).map((value) => (
									<option key={value} value={value}>
										{t(`reason_${value}`)}
									</option>
								))}
							</select>
							<input
								aria-label={t("decisionNote")}
								value={note}
								maxLength={1000}
								onChange={(event) => setNote(event.target.value)}
								placeholder={t("decisionNotePlaceholder")}
								className="h-10 min-w-48 rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm"
							/>
							<button
								type="button"
								disabled={pending}
								onClick={() => onAction("suspend")}
								className={`${actionClass} border border-amber-200 text-amber-800`}
							>
								{t("suspend")}
							</button>
							<button
								type="button"
								disabled={pending}
								onClick={() => onAction("revoke")}
								className={`${actionClass} border border-red-200 text-red-700`}
							>
								{t("revoke")}
							</button>
						</>
					) : null}
					{link.status === "suspended" ? (
						<>
							<button
								type="button"
								disabled={pending}
								onClick={() => onAction("reinstate")}
								className={`${actionClass} bg-emerald-700 text-white`}
							>
								{t("reinstate")}
							</button>
							<button
								type="button"
								disabled={pending}
								onClick={() => onAction("revoke")}
								className={`${actionClass} border border-red-200 text-red-700`}
							>
								{t("revoke")}
							</button>
						</>
					) : null}
					{link.status === "revoked" ? (
						<p className="text-[#64748B] text-sm">{t("revokedHelp")}</p>
					) : null}
				</div>
			) : null}
		</article>
	);
}

function Metric({ value, label }: { value: number; label: string }) {
	return (
		<div className="rounded-lg bg-[#F8FAFC] p-2">
			<dt className="text-[#64748B] text-xs">{label}</dt>
			<dd className="mt-1 font-bold text-[#0F172A]">{value}</dd>
		</div>
	);
}
