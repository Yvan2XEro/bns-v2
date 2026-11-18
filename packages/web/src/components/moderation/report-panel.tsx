"use client";

import { ArrowRight, ExternalLink, ImageIcon } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { AgeChip } from "~/components/moderation/age-chip";
import {
	type ReportTargetPreview,
	useModerationReport,
	useReportDecision,
	useReportTarget,
	useTargetReports,
} from "~/hooks/use-moderation-reports";
import { detailLabel, targetLabel } from "~/lib/moderation-console";
import {
	DECISION_TEXT_MAX,
	listingPhotos,
	REPORT_STATUS_LABELS,
	type ReportOutcome,
	reportDecisionBody,
	reportTargetHref,
} from "~/lib/moderation-reports";
import { relativeAge } from "~/lib/moderation-verification";
import type { Report } from "~/types";
import {
	ConfirmApply,
	DecisionOption,
	DecisionText,
	KeyValue,
	PanelError,
	PanelSection,
} from "./console-parts";
import { DetailNotFound } from "./master-detail";
import { QueueTypeBadge, TranslatedCode } from "./queue-item-parts";
import { personName } from "./reports-table";

function useDateFormat() {
	const locale = useLocale();
	const format = new Intl.DateTimeFormat(locale, {
		dateStyle: "medium",
		timeStyle: "short",
	});
	return (iso: string) => format.format(new Date(iso));
}

export function PanelLoading() {
	const t = useTranslations("ModerationConsole");
	return (
		<output
			aria-label={t("panel.loading")}
			className="block h-40 animate-pulse rounded-lg bg-subtle"
		/>
	);
}

/** Loads a report by id and shows it; `onDecided` moves the console on. */
export function ReportPanel({
	reportId,
	listingHref,
	onDecided,
}: {
	reportId: string;
	/** The reports-section link that opens a pending listing in the panel. */
	listingHref: (id: string) => string;
	onDecided: (id: string) => void;
}) {
	const report = useModerationReport(reportId);
	if (report.isPending) return <PanelLoading />;
	if (report.isError || !report.data) return <DetailNotFound />;
	return (
		<ReportDetail
			report={report.data}
			listingHref={listingHref}
			onDecided={onDecided}
		/>
	);
}

export function ReportDetail({
	report,
	listingHref,
	onDecided,
}: {
	report: Report;
	listingHref: (id: string) => string;
	onDecided: (id: string) => void;
}) {
	const t = useTranslations("ModerationConsole");
	const format = useDateFormat();
	const target = { type: report.targetType, id: report.targetId };
	const preview = useReportTarget(target);
	const others = useTargetReports(target);
	const otherReports = (others.data?.docs ?? []).filter(
		(other) => other.id !== report.id,
	);
	const reporter = personName(report.reporter);
	const typeLabel = targetLabel(report.targetType);

	return (
		<div className="space-y-5">
			<div className="space-y-2">
				<div className="flex flex-wrap items-center gap-2">
					<QueueTypeBadge type="report" />
					{report.status !== "pending" ? (
						<span className="inline-flex rounded-full bg-subtle px-2.5 py-0.5 font-semibold text-ink-soft text-xs">
							{t(REPORT_STATUS_LABELS[report.status])}
						</span>
					) : null}
				</div>
				<h2 className="break-words font-bold font-heading text-ink text-lg">
					<TranslatedCode label={detailLabel("report", report.reason)} />
				</h2>
				<p className="text-ink-muted text-sm">
					{t("reports.reportedBy", { name: reporter ?? "—" })} ·{" "}
					{format(report.createdAt)}{" "}
					<AgeChip age={relativeAge(report.createdAt)} />
				</p>
			</div>

			<PanelSection title={t("reports.description")}>
				{report.description ? (
					<p className="whitespace-pre-wrap break-words rounded-lg bg-canvas p-3 text-ink text-sm">
						{report.description}
					</p>
				) : (
					<p className="text-ink-muted text-sm">{t("reports.noDescription")}</p>
				)}
			</PanelSection>

			<PanelSection
				title={t("reports.target", {
					type: typeLabel ? t(typeLabel) : report.targetType,
				})}
			>
				<TargetPreview
					type={report.targetType}
					id={report.targetId}
					preview={preview.data}
					loading={preview.isPending}
					failed={preview.isError}
					listingHref={listingHref}
				/>
			</PanelSection>

			<PanelSection title={t("reports.others", { count: otherReports.length })}>
				{others.isPending ? null : otherReports.length === 0 ? (
					<p className="text-ink-muted text-sm">{t("reports.noOthers")}</p>
				) : (
					<ul className="divide-y divide-line rounded-lg border border-line">
						{otherReports.slice(0, 10).map((other) => (
							<li
								key={other.id}
								className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
							>
								<span className="min-w-0 truncate text-ink">
									<TranslatedCode label={detailLabel("report", other.reason)} />
								</span>
								<span className="flex shrink-0 items-center gap-2 text-ink-muted text-xs">
									{t(REPORT_STATUS_LABELS[other.status])}
									<AgeChip age={relativeAge(other.createdAt)} />
								</span>
							</li>
						))}
					</ul>
				)}
			</PanelSection>

			{report.status === "pending" ? (
				<ReportDecisionForm reportId={report.id} onDecided={onDecided} />
			) : report.resolution ? (
				<PanelSection title={t("reports.resolution")}>
					<p className="whitespace-pre-wrap break-words text-ink text-sm">
						{report.resolution}
					</p>
				</PanelSection>
			) : null}
		</div>
	);
}

function TargetPreview({
	type,
	id,
	preview,
	loading,
	failed,
	listingHref,
}: {
	type: string;
	id: string;
	preview: ReportTargetPreview | undefined;
	loading: boolean;
	failed: boolean;
	listingHref: (id: string) => string;
}) {
	const t = useTranslations("ModerationConsole");
	const href = reportTargetHref(type, id);
	const box = "space-y-2 rounded-lg border border-line p-3";
	const link =
		"inline-flex items-center gap-1.5 rounded font-semibold text-brand text-sm hover:underline focus-visible:outline-2 focus-visible:outline-brand";

	if (loading)
		return <div className="h-16 animate-pulse rounded-lg bg-subtle" />;
	if (failed || !preview || preview.type === "none")
		return (
			<div className={box}>
				<p className="font-mono text-ink-soft text-xs">{id}</p>
				<p className="text-ink-muted text-sm">
					{failed ? t("reports.targetGone") : t("reports.targetNoPage")}
				</p>
			</div>
		);

	if (preview.type === "listing") {
		const { listing } = preview;
		const cover = listingPhotos(listing)[0];
		return (
			<div className={box}>
				<div className="flex items-center gap-3">
					<div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-subtle">
						{cover ? (
							// biome-ignore lint/performance/noImgElement: thumbnails from arbitrary storage hosts
							<img
								src={cover.thumb}
								alt=""
								className="h-full w-full object-cover"
							/>
						) : (
							<ImageIcon
								aria-hidden="true"
								className="h-5 w-5 text-ink-ghost"
							/>
						)}
					</div>
					<div className="min-w-0">
						<p className="truncate font-semibold text-ink text-sm">
							{listing.title}
						</p>
						<p className="text-ink-muted text-xs">
							{t(`reports.listingStatus.${listing.status}`)}
						</p>
					</div>
				</div>
				<div className="flex flex-wrap gap-x-4 gap-y-1">
					{href ? (
						<a href={href} target="_blank" rel="noreferrer" className={link}>
							{t("reports.openPublic")}
							<ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
						</a>
					) : null}
					{listing.status === "pending" ? (
						<Link
							href={listingHref(listing.id)}
							scroll={false}
							className={link}
						>
							{t("reports.reviewListing")}
							<ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
						</Link>
					) : null}
				</div>
			</div>
		);
	}

	if (preview.type === "user") {
		const { account } = preview;
		return (
			<div className={box}>
				<p className="font-semibold text-ink text-sm">
					{account.user.name || account.user.email || account.user.id}
				</p>
				<dl className="space-y-1">
					{account.user.email && account.user.name ? (
						<KeyValue label={t("reports.email")}>{account.user.email}</KeyValue>
					) : null}
					<KeyValue label={t("reports.standing")}>
						{account.suspension?.active
							? t("reports.suspended")
							: t("reports.active")}
					</KeyValue>
					{account.counts?.reportsAgainst !== undefined ? (
						<KeyValue label={t("reports.reportsAgainst")}>
							{account.counts.reportsAgainst}
						</KeyValue>
					) : null}
				</dl>
			</div>
		);
	}

	const { shop } = preview;
	return (
		<div className={box}>
			<p className="font-semibold text-ink text-sm">{shop.shop.name}</p>
			<dl className="space-y-1">
				{shop.shop.status ? (
					<KeyValue label={t("reports.standing")}>
						{shop.shop.status === "suspended"
							? t("reports.suspended")
							: shop.shop.status === "closed"
								? t("reports.closed")
								: t("reports.active")}
					</KeyValue>
				) : null}
				{shop.counts?.reportsAgainst !== undefined ? (
					<KeyValue label={t("reports.reportsAgainst")}>
						{shop.counts.reportsAgainst}
					</KeyValue>
				) : null}
			</dl>
			{href ? (
				<Link href={href} className={link}>
					{t("reports.openShop")}
					<ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
				</Link>
			) : null}
		</div>
	);
}

function ReportDecisionForm({
	reportId,
	onDecided,
}: {
	reportId: string;
	onDecided: (id: string) => void;
}) {
	const t = useTranslations("ModerationConsole");
	const decision = useReportDecision();
	const [outcome, setOutcome] = useState<ReportOutcome>("resolved");
	const [text, setText] = useState("");
	const [confirming, setConfirming] = useState(false);
	const [touched, setTouched] = useState(false);
	const checked = reportDecisionBody(outcome, text);
	const fieldId = `report-resolution-${reportId}`;

	const choose = (value: string) => {
		setOutcome(value === "dismissed" ? "dismissed" : "resolved");
		setConfirming(false);
	};

	return (
		<PanelSection
			title={t("decision.title")}
			className="border-line border-t pt-4"
		>
			<fieldset className="space-y-2">
				<legend className="sr-only">{t("decision.title")}</legend>
				<DecisionOption
					name={`report-outcome-${reportId}`}
					value="resolved"
					checked={outcome === "resolved"}
					onChange={choose}
					title={t("reports.decision.resolved")}
					body={t("reports.decision.resolvedBody")}
				/>
				<DecisionOption
					name={`report-outcome-${reportId}`}
					value="dismissed"
					checked={outcome === "dismissed"}
					onChange={choose}
					title={t("reports.decision.dismissed")}
					body={t("reports.decision.dismissedBody")}
				/>
			</fieldset>
			<DecisionText
				id={fieldId}
				label={t("reports.decision.note")}
				value={text}
				onChange={(value) => {
					setText(value);
					setConfirming(false);
				}}
				required={outcome === "resolved"}
				max={DECISION_TEXT_MAX}
				placeholder={t("reports.decision.notePlaceholder")}
				error={
					touched && !checked.ok ? t("reports.decision.noteRequired") : null
				}
			/>
			{decision.isError ? (
				<PanelError error={decision.error} fallback={t("decision.failed")} />
			) : null}
			<ConfirmApply
				confirming={confirming}
				pending={decision.isPending}
				applyLabel={t("decision.apply")}
				confirmText={
					outcome === "resolved"
						? t("reports.decision.confirmResolved")
						: t("reports.decision.confirmDismissed")
				}
				confirmLabel={t("decision.confirm")}
				onApply={() => {
					setTouched(true);
					if (checked.ok) setConfirming(true);
				}}
				onCancel={() => setConfirming(false)}
				onConfirm={() => {
					if (!checked.ok) return;
					decision.mutate(
						{ id: reportId, body: checked.body },
						{ onSuccess: () => onDecided(reportId) },
					);
				}}
			/>
			<p className="text-ink-muted text-xs">{t("decision.logged")}</p>
		</PanelSection>
	);
}
