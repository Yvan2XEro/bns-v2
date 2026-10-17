"use client";

import { ArrowRight, ExternalLink, ScrollText } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { LevelBadge } from "~/components/shop/level-badge";
import {
	useShopPayoutAction,
	useShopSuspension,
} from "~/hooks/use-moderation-shops";
import { useOrderMoney } from "~/hooks/use-order-money";
import {
	detailLabel,
	logActionLabel,
	targetLabel,
} from "~/lib/moderation-console";
import { REPORT_STATUS_LABELS } from "~/lib/moderation-reports";
import {
	canActOnShop,
	canReleaseHold,
	HOLD_DURATIONS,
	HOLD_REASON_LABELS,
	holdBody,
	lastLiftedAt,
	MANUAL_HOLD_REASONS,
	type ModerationShopSheet,
	NOTE_MAX,
	PAYOUT_ORIGIN_LABELS,
	type PayoutActionBody,
	personLabel,
	type ShopSheetHold,
	type ShopSheetPendingAccount,
	SUSPENSION_REASON_LABELS,
	SUSPENSION_REASONS,
	shopLogHref,
	suspendBody,
	suspensionDurations,
	unsuspendBody,
	withNote,
} from "~/lib/moderation-shops";
import {
	CONNECTED_ACCOUNT_STATUSES,
	NAME_MATCH_RESULTS,
	PAYOUT_METHODS,
	PAYOUT_STATUSES,
} from "~/lib/payment-status";
import { activityLabelKey } from "~/lib/shop-activity";
import { cn } from "~/lib/utils";
import { badgeForLevel } from "~/lib/verification";
import {
	ConfirmApply,
	DecisionText,
	KeyValue,
	PanelError,
	PanelSection,
} from "./console-parts";
import { TranslatedCode } from "./queue-item-parts";
import { ShopLogo, ShopStatusChip } from "./shops-table";

const LINK =
	"inline-flex items-center gap-1 rounded font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-brand";
const CARD = "space-y-3 rounded-xl border border-line bg-surface p-4";
const SELECT =
	"h-10 w-full rounded-lg border border-line bg-surface px-3 text-ink text-sm focus-visible:outline-2 focus-visible:outline-brand";
const SECONDARY =
	"h-9 rounded-lg border border-line-strong bg-surface px-3 font-semibold text-ink text-sm hover:bg-subtle focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-60";

export interface ShopSheetViewer {
	id: string | null;
	role: string | null;
}

function useDates() {
	const locale = useLocale();
	const day = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
	const time = new Intl.DateTimeFormat(locale, {
		dateStyle: "medium",
		timeStyle: "short",
	});
	return {
		day: (iso: string) => day.format(new Date(iso)),
		time: (iso: string) => time.format(new Date(iso)),
	};
}

function Done({ children }: { children: ReactNode }) {
	return (
		<output className="block rounded-lg border border-ok-line bg-ok-soft px-3 py-2 text-ok-ink text-sm">
			{children}
		</output>
	);
}

function Stat({ label, value }: { label: string; value: number }) {
	return (
		<div className="min-w-0 rounded-lg border border-line bg-surface px-3 py-2">
			<p className="truncate text-ink-muted text-xs">{label}</p>
			<p className="font-bold font-heading text-ink text-xl tabular-nums">
				{value}
			</p>
		</div>
	);
}

/** Everything the shop sheet route returns, with the suspension and payout decisions beside it. */
export function ShopSheet({
	sheet,
	viewer,
}: {
	sheet: ModerationShopSheet;
	viewer: ShopSheetViewer;
}) {
	const t = useTranslations("ModerationConsole");
	const { day } = useDates();
	const { shop, owner, counts } = sheet;
	const canAct = canActOnShop(viewer, owner);

	return (
		<div className="space-y-5">
			<header className="flex flex-wrap items-start gap-4 rounded-xl border border-line bg-surface p-4">
				<ShopLogo name={shop.name} url={shop.logo?.url} size="lg" />
				<div className="min-w-0 flex-1 space-y-1">
					<div className="flex flex-wrap items-center gap-2">
						<h1 className="break-words font-bold font-heading text-2xl text-ink">
							{shop.name}
						</h1>
						<LevelBadge badge={badgeForLevel(shop.level)} size="sm" />
						<ShopStatusChip status={shop.status} />
					</div>
					<p className="text-ink-muted text-sm">
						@{shop.handle} ·{" "}
						{t("shop.createdOn", { date: day(shop.createdAt) })}
					</p>
					{owner ? (
						<p className="text-ink-soft text-sm">
							<span className="font-semibold text-ink">
								{owner.name || owner.email}
							</span>{" "}
							· {t("shop.ownerSince", { date: day(owner.createdAt) })}
							<span className="block break-all text-ink-muted text-xs">
								{owner.email}
							</span>
						</p>
					) : (
						<p className="text-ink-muted text-sm">{t("shop.noOwner")}</p>
					)}
				</div>
				<div className="flex w-full flex-wrap gap-3 text-sm sm:w-auto sm:flex-col sm:items-end">
					<Link href={shopLogHref(shop.id)} className={LINK}>
						<ScrollText aria-hidden="true" className="h-4 w-4" />
						{t("shop.journal")}
					</Link>
					<a
						href={`/s/${encodeURIComponent(shop.handle)}`}
						target="_blank"
						rel="noreferrer"
						className={LINK}
					>
						{t("shop.publicPage")}
						<ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
					</a>
				</div>
			</header>

			<div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-5">
				<div className="min-w-0 space-y-5">
					<section aria-label={t("shop.statsLabel")}>
						<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
							<Stat
								label={t("shop.stat.published")}
								value={counts.publishedListings}
							/>
							<Stat
								label={t("shop.stat.products")}
								value={counts.activeProducts}
							/>
							<Stat
								label={t("shop.stat.drafts")}
								value={counts.draftProducts}
							/>
							<Stat
								label={t("shop.stat.reports")}
								value={counts.reportsAgainst}
							/>
						</div>
					</section>
					<ReportsSection sheet={sheet} />
					<StrikesSection sheet={sheet} />
					<HistorySection sheet={sheet} />
					<TeamSection sheet={sheet} />
					<ActivitySection sheet={sheet} />
				</div>
				<aside className="mt-5 min-w-0 space-y-5 lg:sticky lg:top-6 lg:mt-0">
					<SuspensionCard sheet={sheet} viewer={viewer} canAct={canAct} />
					<PaymentsCard sheet={sheet} isAdmin={viewer.role === "admin"} />
				</aside>
			</div>
		</div>
	);
}

function ReportsSection({ sheet }: { sheet: ModerationShopSheet }) {
	const t = useTranslations("ModerationConsole");
	const { day } = useDates();
	return (
		<section className={CARD}>
			<h2 className="font-bold font-heading text-ink">
				{t("shop.reportsTitle")}
			</h2>
			{sheet.reports.length === 0 ? (
				<p className="text-ink-muted text-sm">{t("shop.noReports")}</p>
			) : (
				<ul className="divide-y divide-line">
					{sheet.reports.map((report) => {
						const target = targetLabel(report.targetType);
						return (
							<li
								key={report.id}
								className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
							>
								<div className="min-w-0">
									<Link
										href={`/moderation/reports?item=${encodeURIComponent(`report:${report.id}`)}`}
										className={LINK}
									>
										<TranslatedCode
											label={detailLabel("report", report.reason)}
										/>
									</Link>
									<p className="text-ink-muted text-xs">
										{target ? t(target) : report.targetType} ·{" "}
										{day(report.createdAt)}
									</p>
								</div>
								<span
									className={cn(
										"rounded-full px-2.5 py-0.5 font-semibold text-xs",
										report.status === "pending"
											? "bg-warn-soft text-warn-ink"
											: "bg-subtle text-ink-soft",
									)}
								>
									{t(REPORT_STATUS_LABELS[report.status])}
								</span>
							</li>
						);
					})}
				</ul>
			)}
			{sheet.counts.reportsAgainst > sheet.reports.length ? (
				<p className="text-ink-muted text-xs">
					{t("shop.reportsMore", {
						shown: sheet.reports.length,
						total: sheet.counts.reportsAgainst,
					})}
				</p>
			) : null}
		</section>
	);
}

function StrikesSection({ sheet }: { sheet: ModerationShopSheet }) {
	const t = useTranslations("ModerationConsole");
	const tDisputes = useTranslations("ModerationDisputes");
	const { day } = useDates();
	const { standing } = sheet;
	const restrictions = [
		standing.restrictions.codCapHalved && "shop.restriction.codCapHalved",
		standing.restrictions.protectedCapHalved &&
			"shop.restriction.protectedCapHalved",
		standing.restrictions.protectedUnavailable &&
			"shop.restriction.protectedUnavailable",
	].filter((key): key is string => typeof key === "string");
	return (
		<section className={CARD}>
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<h2 className="font-bold font-heading text-ink">
					{t("shop.strikesTitle")}
				</h2>
				<span className="text-ink-muted text-sm">
					{t("shop.activeWeight", { weight: standing.activeWeight })}
				</span>
			</div>
			{restrictions.length > 0 ? (
				<ul className="space-y-1 rounded-lg border border-bad-line bg-bad-faint p-3 text-bad-ink text-sm">
					{restrictions.map((key) => (
						<li key={key}>{t(key)}</li>
					))}
				</ul>
			) : standing.activeWeight > 0 && !standing.effectsEnabled ? (
				<p className="text-ink-muted text-xs">{t("shop.effectsOff")}</p>
			) : null}
			{standing.strikes.length === 0 ? (
				<p className="text-ink-muted text-sm">{tDisputes("noStrikes")}</p>
			) : (
				<ul className="divide-y divide-line">
					{standing.strikes.map((strike) => (
						<li
							key={strike.id}
							className="flex flex-wrap justify-between gap-2 py-2 text-sm"
						>
							<span className="font-semibold text-ink">
								{tDisputes(`strikeKind.${strike.kind}`)}
							</span>
							<span className="text-ink-muted text-xs">
								{tDisputes(`strikeStatus.${strike.status}`)} ·{" "}
								{tDisputes("strikeWeight", { weight: strike.weight })} ·{" "}
								{tDisputes("strikeExpires", { date: day(strike.expiresAt) })}
							</span>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

function HistorySection({ sheet }: { sheet: ModerationShopSheet }) {
	const t = useTranslations("ModerationConsole");
	const tRoot = useTranslations();
	const { time } = useDates();
	return (
		<section className={CARD}>
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<h2 className="font-bold font-heading text-ink">
					{t("shop.historyTitle")}
				</h2>
				<Link href={shopLogHref(sheet.shop.id)} className={`${LINK} text-sm`}>
					{t("shop.journal")}
					<ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
				</Link>
			</div>
			{sheet.history.length === 0 ? (
				<p className="text-ink-muted text-sm">{t("shop.noHistory")}</p>
			) : (
				<ol className="space-y-2">
					{sheet.history.map((entry) => {
						const label = logActionLabel(entry.action);
						const actor = personLabel(entry.actor);
						const reason = entry.reason
							? detailLabel("report", entry.reason)
							: null;
						return (
							<li key={entry.id} className="rounded-lg bg-canvas p-3 text-sm">
								<div className="flex flex-wrap justify-between gap-2">
									<span className="font-semibold text-ink">
										{"raw" in label ? label.raw : tRoot(label.key)}
									</span>
									<span className="text-ink-muted text-xs">
										{time(entry.createdAt)}
									</span>
								</div>
								<p className="text-ink-muted text-xs">
									{actor ?? t("log.system")}
									{reason ? (
										<>
											{" · "}
											<TranslatedCode label={reason} />
										</>
									) : null}
								</p>
								{entry.note ? (
									<p className="mt-1 whitespace-pre-wrap break-words text-ink-soft">
										{entry.note}
									</p>
								) : null}
							</li>
						);
					})}
				</ol>
			)}
		</section>
	);
}

function TeamSection({ sheet }: { sheet: ModerationShopSheet }) {
	const t = useTranslations("ModerationConsole");
	const tActivity = useTranslations("shopActivity");
	const { day } = useDates();
	return (
		<section className={CARD}>
			<h2 className="font-bold font-heading text-ink">{t("shop.teamTitle")}</h2>
			{sheet.team.length === 0 ? (
				<p className="text-ink-muted text-sm">{t("shop.noTeam")}</p>
			) : (
				<ul className="divide-y divide-line">
					{sheet.team.map((member) => (
						<li
							key={member.id}
							className="flex flex-wrap justify-between gap-2 py-2 text-sm"
						>
							<span className="font-semibold text-ink">
								{member.name ?? "—"}
							</span>
							<span className="text-ink-muted text-xs">
								{tActivity(`roles.${member.role}`)}
								{member.joinedAt
									? ` · ${t("shop.joinedOn", { date: day(member.joinedAt) })}`
									: ""}
							</span>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

function ActivitySection({ sheet }: { sheet: ModerationShopSheet }) {
	const t = useTranslations("ModerationConsole");
	const tRoot = useTranslations();
	const tActivity = useTranslations("shopActivity");
	const { time } = useDates();
	if (sheet.activity.length === 0) return null;
	return (
		<section className={CARD}>
			<h2 className="font-bold font-heading text-ink">
				{t("shop.activityTitle")}
			</h2>
			<ul className="divide-y divide-line">
				{sheet.activity.map((entry) => (
					<li
						key={entry.id}
						className="flex flex-wrap justify-between gap-2 py-2 text-sm"
					>
						<span className="min-w-0 text-ink">
							{tRoot(activityLabelKey(entry.action))}
							<span className="text-ink-muted">
								{" · "}
								{entry.actor?.name ?? tActivity("roles.system")}
							</span>
						</span>
						<span className="text-ink-muted text-xs">
							{time(entry.createdAt)}
						</span>
					</li>
				))}
			</ul>
		</section>
	);
}

function SuspensionCard({
	sheet,
	viewer,
	canAct,
}: {
	sheet: ModerationShopSheet;
	viewer: ShopSheetViewer;
	canAct: boolean;
}) {
	const t = useTranslations("ModerationConsole");
	const { day, time } = useDates();
	const { suspension, shop } = sheet;
	const lifted = lastLiftedAt(sheet.history);
	const by = personLabel(suspension.by);
	const [done, setDone] = useState<string | null>(null);
	const suspended = shop.status === "suspended";

	return (
		<section className={CARD}>
			<h2 className="font-bold font-heading text-ink">
				{t("shop.suspensionTitle")}
			</h2>
			{suspended ? (
				<div className="space-y-2 rounded-lg border border-bad-line bg-bad-faint p-3 text-sm">
					<p className="font-semibold text-bad-ink">
						{suspension.indefinite || !suspension.until
							? t("shop.suspendedIndefinitely")
							: t("shop.suspendedUntil", { date: time(suspension.until) })}
					</p>
					<dl className="space-y-1">
						{suspension.since ? (
							<KeyValue label={t("shop.since")}>
								{day(suspension.since)}
							</KeyValue>
						) : null}
						{suspension.reason ? (
							<KeyValue label={t("shop.reason")}>
								<TranslatedCode
									label={detailLabel("report", suspension.reason)}
								/>
							</KeyValue>
						) : null}
						{by ? <KeyValue label={t("shop.by")}>{by}</KeyValue> : null}
					</dl>
					{suspension.note ? (
						<p className="whitespace-pre-wrap break-words text-ink-soft">
							{suspension.note}
						</p>
					) : null}
				</div>
			) : (
				<div className="text-sm">
					<p className="font-semibold text-ink">
						{shop.status === "closed"
							? t("shop.closed")
							: t("shop.noSuspension")}
					</p>
					{lifted ? (
						<p className="text-ink-muted text-xs">
							{t("shop.lastLifted", { date: day(lifted) })}
						</p>
					) : null}
				</div>
			)}
			{done ? <Done>{done}</Done> : null}
			{!canAct ? (
				<p className="text-ink-muted text-xs">{t("shop.cannotAct")}</p>
			) : suspended ? (
				<LiftForm
					shopId={shop.id}
					onDone={() => setDone(t("shop.liftedDone"))}
				/>
			) : shop.status === "active" ? (
				<SuspendForm
					shopId={shop.id}
					isAdmin={viewer.role === "admin"}
					onDone={() => setDone(t("shop.suspendedDone"))}
				/>
			) : null}
		</section>
	);
}

function SuspendForm({
	shopId,
	isAdmin,
	onDone,
}: {
	shopId: string;
	isAdmin: boolean;
	onDone: () => void;
}) {
	const t = useTranslations("ModerationConsole");
	const mutation = useShopSuspension(shopId);
	const [open, setOpen] = useState(false);
	const [reason, setReason] = useState("");
	const [duration, setDuration] = useState<number | null>(7);
	const [note, setNote] = useState("");
	const [confirming, setConfirming] = useState(false);
	const [touched, setTouched] = useState(false);
	const durations = suspensionDurations(isAdmin);
	const body = suspendBody({ reason, durationDays: duration, note, isAdmin });
	const id = `suspend-${shopId}`;

	if (!open)
		return (
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="h-10 w-full rounded-lg bg-bad px-4 font-semibold text-sm text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
			>
				{t("shop.suspend")}
			</button>
		);

	const change =
		<T,>(set: (value: T) => void) =>
		(value: T) => {
			set(value);
			setConfirming(false);
		};

	return (
		<div className="space-y-3 border-line border-t pt-3">
			<div className="space-y-1.5">
				<label
					htmlFor={`${id}-reason`}
					className="font-semibold text-ink-soft text-sm"
				>
					{t("shop.reason")}
				</label>
				<select
					id={`${id}-reason`}
					value={reason}
					onChange={(event) => change(setReason)(event.target.value)}
					aria-invalid={touched && !reason ? true : undefined}
					aria-describedby={
						touched && !reason ? `${id}-reason-error` : undefined
					}
					className={SELECT}
				>
					<option value="">{t("shop.chooseReason")}</option>
					{SUSPENSION_REASONS.map((value) => (
						<option key={value} value={value}>
							{t(SUSPENSION_REASON_LABELS[value])}
						</option>
					))}
				</select>
				{touched && !reason ? (
					<p id={`${id}-reason-error`} className="text-bad-ink text-xs">
						{t("shop.reasonRequired")}
					</p>
				) : null}
			</div>
			<div className="space-y-1.5">
				<label
					htmlFor={`${id}-duration`}
					className="font-semibold text-ink-soft text-sm"
				>
					{t("shop.duration")}
				</label>
				<select
					id={`${id}-duration`}
					value={duration === null ? "" : String(duration)}
					onChange={(event) =>
						change(setDuration)(
							event.target.value ? Number(event.target.value) : null,
						)
					}
					className={SELECT}
				>
					{durations.map((days) => (
						<option
							key={days ?? "none"}
							value={days === null ? "" : String(days)}
						>
							{days === null
								? t("risk.decision.untilLifted")
								: t("risk.days", { count: days })}
						</option>
					))}
				</select>
				{!isAdmin ? (
					<p className="text-ink-muted text-xs">{t("shop.durationHint")}</p>
				) : null}
			</div>
			<DecisionText
				id={`${id}-note`}
				label={t("shop.note")}
				value={note}
				onChange={change(setNote)}
				required={false}
				max={NOTE_MAX}
				placeholder={t("shop.notePlaceholder")}
			/>
			{mutation.isError ? (
				<PanelError error={mutation.error} fallback={t("decision.failed")} />
			) : null}
			<ConfirmApply
				confirming={confirming}
				pending={mutation.isPending}
				danger
				applyLabel={t("shop.suspend")}
				confirmText={t("shop.suspendConfirm")}
				confirmLabel={t("decision.confirm")}
				onApply={() => {
					setTouched(true);
					if (body) setConfirming(true);
				}}
				onCancel={() => setConfirming(false)}
				onConfirm={() => {
					if (!body) return;
					mutation.mutate(body, {
						onSuccess: () => {
							setOpen(false);
							setConfirming(false);
							onDone();
						},
					});
				}}
			/>
			<button
				type="button"
				onClick={() => {
					setOpen(false);
					setConfirming(false);
				}}
				className="w-full rounded text-ink-muted text-sm hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
			>
				{t("decision.cancel")}
			</button>
			<p className="text-ink-muted text-xs">{t("shop.suspendFootnote")}</p>
		</div>
	);
}

function LiftForm({ shopId, onDone }: { shopId: string; onDone: () => void }) {
	const t = useTranslations("ModerationConsole");
	const mutation = useShopSuspension(shopId);
	const [restore, setRestore] = useState(true);
	const [note, setNote] = useState("");
	const [confirming, setConfirming] = useState(false);
	const body = unsuspendBody({ restoreListings: restore, note });
	const id = `lift-${shopId}`;
	return (
		<div className="space-y-3 border-line border-t pt-3">
			<label className="flex items-start gap-2 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand">
				<input
					type="checkbox"
					checked={restore}
					onChange={(event) => {
						setRestore(event.target.checked);
						setConfirming(false);
					}}
					className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
				/>
				<span>
					<span className="block font-semibold text-ink">
						{t("shop.restoreListings")}
					</span>
					<span className="block text-ink-muted text-xs">
						{t("shop.restoreListingsBody")}
					</span>
				</span>
			</label>
			<DecisionText
				id={`${id}-note`}
				label={t("shop.note")}
				value={note}
				onChange={(value) => {
					setNote(value);
					setConfirming(false);
				}}
				required={false}
				max={NOTE_MAX}
			/>
			{mutation.isError ? (
				<PanelError error={mutation.error} fallback={t("decision.failed")} />
			) : null}
			<ConfirmApply
				confirming={confirming}
				pending={mutation.isPending}
				applyLabel={t("shop.lift")}
				confirmText={t("shop.liftConfirm")}
				confirmLabel={t("decision.confirm")}
				onApply={() => {
					if (body) setConfirming(true);
				}}
				onCancel={() => setConfirming(false)}
				onConfirm={() => {
					if (!body) return;
					mutation.mutate(body, {
						onSuccess: () => {
							setConfirming(false);
							setNote("");
							onDone();
						},
					});
				}}
			/>
		</div>
	);
}

function PaymentsCard({
	sheet,
	isAdmin,
}: {
	sheet: ModerationShopSheet;
	isAdmin: boolean;
}) {
	const t = useTranslations("ModerationConsole");
	const tPay = useTranslations("Payments");
	const money = useOrderMoney();
	const { day } = useDates();
	const { payments } = sheet;
	const [done, setDone] = useState<string | null>(null);
	const rate = payments.refundRate;
	const account = payments.connectedAccount;

	return (
		<section className={CARD}>
			<h2 className="font-bold font-heading text-ink">
				{t("shop.paymentsTitle")}
			</h2>
			{done ? <Done>{done}</Done> : null}

			<dl className="space-y-1.5">
				<KeyValue label={t("shop.connectedAccount")}>
					{account
						? tPay(CONNECTED_ACCOUNT_STATUSES[account.status])
						: t("shop.none")}
				</KeyValue>
				{account ? (
					<KeyValue label={t("shop.payoutsEnabled")}>
						{account.payoutsEnabled ? t("shop.yes") : t("shop.no")}
					</KeyValue>
				) : null}
				<KeyValue label={t("shop.openExposure")}>
					{money(payments.openExposure)}
				</KeyValue>
				<KeyValue label={t("shop.refundRate", { days: rate.windowDays })}>
					{rate.orders === 0
						? "—"
						: `${rate.refundedOrders} / ${rate.orders} (${Math.round(
								(rate.refundedOrders / rate.orders) * 100,
							)} %)`}
				</KeyValue>
			</dl>

			<PanelSection title={t("shop.payoutAccount")}>
				{payments.payoutAccount ? (
					<div className="rounded-lg bg-canvas p-3 text-sm">
						<p className="font-semibold text-ink">
							{tPay(PAYOUT_METHODS[payments.payoutAccount.method])} ·{" "}
							{payments.payoutAccount.accountNumberMasked}
						</p>
						<p className="text-ink-muted text-xs">
							{payments.payoutAccount.accountName}
							{payments.payoutAccount.activatedAt
								? ` · ${t("shop.activeSince", { date: day(payments.payoutAccount.activatedAt) })}`
								: ""}
						</p>
					</div>
				) : (
					<p className="text-ink-muted text-sm">{t("shop.noPayoutAccount")}</p>
				)}
			</PanelSection>

			{payments.pendingAccounts.length > 0 ? (
				<PanelSection title={t("shop.pendingAccounts")}>
					<ul className="space-y-2">
						{payments.pendingAccounts.map((pending) => (
							<PendingAccount
								key={pending.id}
								shopId={sheet.shop.id}
								account={pending}
								onDone={setDone}
							/>
						))}
					</ul>
				</PanelSection>
			) : null}

			<PanelSection title={t("shop.holds")}>
				{payments.holds.length === 0 ? (
					<p className="text-ink-muted text-sm">{t("shop.noHolds")}</p>
				) : (
					<ul className="space-y-2">
						{payments.holds.map((hold) => (
							<HoldRow
								key={hold.id}
								shopId={sheet.shop.id}
								hold={hold}
								canRelease={canReleaseHold(hold.reason, isAdmin)}
								onDone={setDone}
							/>
						))}
					</ul>
				)}
				<HoldForm shopId={sheet.shop.id} onDone={setDone} />
			</PanelSection>

			{payments.lastPayouts.length > 0 ? (
				<PanelSection title={t("shop.lastPayouts")}>
					<ul className="divide-y divide-line text-sm">
						{payments.lastPayouts.map((payout) => (
							<li key={payout.id} className="py-2">
								<div className="flex justify-between gap-2">
									<span className="font-semibold text-ink tabular-nums">
										{money(payout.amount)}
									</span>
									<span className="text-ink-soft text-xs">
										{tPay(PAYOUT_STATUSES[payout.status])}
									</span>
								</div>
								<p className="text-ink-muted text-xs">
									{t(PAYOUT_ORIGIN_LABELS[payout.origin])} ·{" "}
									{day(payout.createdAt)}
									{payout.failureReason ? ` · ${payout.failureReason}` : ""}
								</p>
							</li>
						))}
					</ul>
				</PanelSection>
			) : null}
		</section>
	);
}

/** One payout decision: a button that opens an optional note and the in-place confirmation. */
function PayoutDecision({
	shopId,
	body,
	label,
	confirmText,
	doneText,
	danger,
	onDone,
	variant = "secondary",
}: {
	shopId: string;
	body: PayoutActionBody;
	label: string;
	confirmText: string;
	doneText: string;
	danger?: boolean;
	onDone: (text: string) => void;
	variant?: "secondary" | "primary";
}) {
	const t = useTranslations("ModerationConsole");
	const mutation = useShopPayoutAction(shopId);
	const [open, setOpen] = useState(false);
	const [note, setNote] = useState("");
	const [confirming, setConfirming] = useState(false);
	const withText = withNote(body, note);
	const id = `payout-${body.action}-${"accountId" in body ? body.accountId : "holdId" in body ? body.holdId : "shop"}`;

	if (!open)
		return (
			<button
				type="button"
				onClick={() => setOpen(true)}
				className={cn(
					SECONDARY,
					variant === "primary" &&
						"border-transparent bg-brand-fill text-white hover:bg-brand-strong",
					danger && "text-bad-ink",
				)}
			>
				{label}
			</button>
		);
	return (
		<div className="w-full space-y-2 pt-1">
			<DecisionText
				id={`${id}-note`}
				label={t("shop.note")}
				value={note}
				onChange={(value) => {
					setNote(value);
					setConfirming(false);
				}}
				required={false}
				max={NOTE_MAX}
			/>
			{mutation.isError ? (
				<PanelError error={mutation.error} fallback={t("decision.failed")} />
			) : null}
			<ConfirmApply
				confirming={confirming}
				pending={mutation.isPending}
				danger={danger}
				applyLabel={label}
				confirmText={confirmText}
				confirmLabel={t("decision.confirm")}
				onApply={() => {
					if (withText) setConfirming(true);
				}}
				onCancel={() => {
					setConfirming(false);
					setOpen(false);
				}}
				onConfirm={() => {
					if (!withText) return;
					mutation.mutate(withText, {
						onSuccess: () => {
							setOpen(false);
							setConfirming(false);
							onDone(doneText);
						},
					});
				}}
			/>
		</div>
	);
}

function PendingAccount({
	shopId,
	account,
	onDone,
}: {
	shopId: string;
	account: ShopSheetPendingAccount;
	onDone: (text: string) => void;
}) {
	const t = useTranslations("ModerationConsole");
	const tPay = useTranslations("Payments");
	const { day } = useDates();
	return (
		<li className="space-y-2 rounded-lg border border-line p-3 text-sm">
			<div>
				<p className="font-semibold text-ink">
					{tPay(PAYOUT_METHODS[account.method])} · {account.accountNumberMasked}
				</p>
				<p className="text-ink-muted text-xs">
					{account.accountName} ·{" "}
					{t("shop.submittedOn", { date: day(account.createdAt) })}
				</p>
				{account.nameMatch ? (
					<p
						className={cn(
							"mt-1 text-xs",
							account.nameMatch.result === "match"
								? "text-ok-ink"
								: account.nameMatch.result === "partial"
									? "text-warn-ink"
									: "text-bad-ink",
						)}
					>
						{tPay(NAME_MATCH_RESULTS[account.nameMatch.result])}
						{account.nameMatch.identityName
							? ` · ${t("shop.identityName", { name: account.nameMatch.identityName })}`
							: ""}
					</p>
				) : null}
			</div>
			<div className="flex flex-wrap gap-2">
				<PayoutDecision
					shopId={shopId}
					body={{ action: "approve_account", accountId: account.id }}
					label={t("shop.approveAccount")}
					confirmText={t("shop.approveAccountConfirm")}
					doneText={t("shop.approveAccountDone")}
					variant="primary"
					onDone={onDone}
				/>
				<PayoutDecision
					shopId={shopId}
					body={{ action: "reject_account", accountId: account.id }}
					label={t("shop.rejectAccount")}
					confirmText={t("shop.rejectAccountConfirm")}
					doneText={t("shop.rejectAccountDone")}
					danger
					onDone={onDone}
				/>
			</div>
		</li>
	);
}

function HoldRow({
	shopId,
	hold,
	canRelease,
	onDone,
}: {
	shopId: string;
	hold: ShopSheetHold;
	/** The API refuses the rest: the suspension's own hold, and admin-only reasons to a moderator. */
	canRelease: boolean;
	onDone: (text: string) => void;
}) {
	const t = useTranslations("ModerationConsole");
	const { day } = useDates();
	return (
		<li className="space-y-2 rounded-lg border border-warn-line bg-warn-faint p-3 text-sm">
			<div>
				<p className="font-semibold text-ink">
					{t(HOLD_REASON_LABELS[hold.reason])}
				</p>
				<p className="text-ink-muted text-xs">
					{hold.createdByType === "system"
						? t("shop.holdBySystem")
						: t("shop.holdByModerator")}{" "}
					· {day(hold.createdAt)} ·{" "}
					{hold.until
						? t("shop.holdUntil", { date: day(hold.until) })
						: t("shop.holdUntilReleased")}
					{hold.scope === "order" && hold.orderId
						? ` · ${t("shop.holdOrder", { id: hold.orderId.slice(-6) })}`
						: ""}
					{hold.blocksCharges ? ` · ${t("shop.blocksCharges")}` : ""}
				</p>
				{hold.note ? (
					<p className="mt-1 whitespace-pre-wrap break-words text-ink-soft">
						{hold.note}
					</p>
				) : null}
			</div>
			{canRelease ? (
				<PayoutDecision
					shopId={shopId}
					body={{ action: "release", holdId: hold.id }}
					label={t("shop.releaseHold")}
					confirmText={t("shop.releaseHoldConfirm")}
					doneText={t("shop.releaseHoldDone")}
					onDone={onDone}
				/>
			) : null}
		</li>
	);
}

function HoldForm({
	shopId,
	onDone,
}: {
	shopId: string;
	onDone: (text: string) => void;
}) {
	const t = useTranslations("ModerationConsole");
	const mutation = useShopPayoutAction(shopId);
	const [open, setOpen] = useState(false);
	const [reason, setReason] = useState<string>("moderation");
	const [days, setDays] = useState<number | null>(7);
	const [note, setNote] = useState("");
	const [confirming, setConfirming] = useState(false);
	const body = holdBody({ reason, untilDays: days, note });
	const id = `hold-${shopId}`;

	if (!open)
		return (
			<button type="button" onClick={() => setOpen(true)} className={SECONDARY}>
				{t("shop.placeHold")}
			</button>
		);
	return (
		<div className="space-y-3 rounded-lg border border-line p-3">
			<div className="space-y-1.5">
				<label
					htmlFor={`${id}-reason`}
					className="font-semibold text-ink-soft text-sm"
				>
					{t("shop.reason")}
				</label>
				<select
					id={`${id}-reason`}
					value={reason}
					onChange={(event) => {
						setReason(event.target.value);
						setConfirming(false);
					}}
					className={SELECT}
				>
					{MANUAL_HOLD_REASONS.map((value) => (
						<option key={value} value={value}>
							{t(HOLD_REASON_LABELS[value])}
						</option>
					))}
				</select>
			</div>
			<div className="space-y-1.5">
				<label
					htmlFor={`${id}-days`}
					className="font-semibold text-ink-soft text-sm"
				>
					{t("shop.duration")}
				</label>
				<select
					id={`${id}-days`}
					value={days === null ? "" : String(days)}
					onChange={(event) => {
						setDays(event.target.value ? Number(event.target.value) : null);
						setConfirming(false);
					}}
					className={SELECT}
				>
					{HOLD_DURATIONS.map((value) => (
						<option
							key={value ?? "none"}
							value={value === null ? "" : String(value)}
						>
							{value === null
								? t("shop.holdUntilReleased")
								: t("risk.days", { count: value })}
						</option>
					))}
				</select>
			</div>
			<DecisionText
				id={`${id}-note`}
				label={t("shop.note")}
				value={note}
				onChange={(value) => {
					setNote(value);
					setConfirming(false);
				}}
				required={false}
				max={NOTE_MAX}
			/>
			{mutation.isError ? (
				<PanelError error={mutation.error} fallback={t("decision.failed")} />
			) : null}
			<ConfirmApply
				confirming={confirming}
				pending={mutation.isPending}
				danger
				applyLabel={t("shop.placeHold")}
				confirmText={t("shop.placeHoldConfirm")}
				confirmLabel={t("decision.confirm")}
				onApply={() => {
					if (body) setConfirming(true);
				}}
				onCancel={() => {
					setConfirming(false);
					setOpen(false);
				}}
				onConfirm={() => {
					if (!body) return;
					mutation.mutate(body, {
						onSuccess: () => {
							setOpen(false);
							setConfirming(false);
							setNote("");
							onDone(t("shop.placeHoldDone"));
						},
					});
				}}
			/>
		</div>
	);
}
