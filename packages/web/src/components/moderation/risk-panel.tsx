"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useClaimRiskFlag } from "~/hooks/use-moderation-console";
import { useRiskDecision, useRiskFlag } from "~/hooks/use-moderation-risk";
import {
	detailLabel,
	logActionLabel,
	type QueueSelection,
} from "~/lib/moderation-console";
import {
	AUTO_EFFECT_LABELS,
	availableDecisions,
	durationChoices,
	evidenceValue,
	needsNote,
	RESOLUTION_LABELS,
	RISK_DECISION_LABELS,
	RISK_SUBJECT_LABELS,
	type RiskDecisionChoice,
	type RiskSubjectView,
	riskDecisionBody,
	riskStatusView,
	riskSubjectView,
} from "~/lib/moderation-risk";
import type { RiskFlagDetail } from "../../../../api/src/contracts/moderationConsole";
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
import { PanelLoading } from "./report-panel";
import { RiskScore, RiskStatusChip } from "./risk-table";

const LINK =
	"inline-flex items-center gap-1 rounded font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-brand";

const shopHref = (id: string) => `/moderation/shops/${encodeURIComponent(id)}`;

export function RiskPanel({
	flagId,
	viewerId,
	isAdmin,
	panelHref,
	onDecided,
}: {
	flagId: string;
	viewerId: string | null;
	isAdmin: boolean;
	panelHref: (item: QueueSelection) => string;
	onDecided: (id: string) => void;
}) {
	const detail = useRiskFlag(flagId);
	if (detail.isPending) return <PanelLoading />;
	if (detail.isError || !detail.data) return <DetailNotFound />;
	return (
		<RiskDetail
			detail={detail.data}
			viewerId={viewerId}
			isAdmin={isAdmin}
			panelHref={panelHref}
			onDecided={onDecided}
		/>
	);
}

export function RiskDetail({
	detail,
	viewerId,
	isAdmin,
	panelHref,
	onDecided,
}: {
	detail: RiskFlagDetail;
	viewerId: string | null;
	isAdmin: boolean;
	panelHref: (item: QueueSelection) => string;
	onDecided: (id: string) => void;
}) {
	const t = useTranslations("ModerationConsole");
	const tRoot = useTranslations();
	const locale = useLocale();
	const date = new Intl.DateTimeFormat(locale, {
		dateStyle: "medium",
		timeStyle: "short",
	});
	const format = (iso: string) => date.format(new Date(iso));
	const { flag, evidenceRows, relatedFlags, moderationHistory } = detail;
	const subject = riskSubjectView(detail.subject);
	const view = riskStatusView(flag, viewerId);
	const claim = useClaimRiskFlag();
	const choices = availableDecisions(flag.status, subject);

	return (
		<div className="space-y-5">
			<div className="space-y-2">
				<div className="flex flex-wrap items-center gap-2">
					<QueueTypeBadge type="risk" />
					<RiskStatusChip view={view} />
				</div>
				<p className="font-mono text-ink-muted text-xs">
					{t("risk.reference", { id: flag.id })}
				</p>
				<h2 className="break-words font-bold font-heading text-ink text-lg">
					<TranslatedCode label={detailLabel("risk", flag.signal)} />
				</h2>
				<div className="flex flex-wrap items-center gap-2 text-ink-muted text-sm">
					<RiskScore score={flag.score} severity={flag.severity} />
					<span>{t("risk.occurrences", { count: flag.occurrences })}</span>
				</div>
			</div>

			<dl className="space-y-2">
				<KeyValue label={t("risk.firstSeen")}>
					{format(flag.firstSeenAt)}
				</KeyValue>
				<KeyValue label={t("risk.lastSeen")}>
					{format(flag.lastSeenAt)}
				</KeyValue>
				{flag.autoEffects?.length ? (
					<KeyValue label={t("risk.autoEffects")}>
						{flag.autoEffects
							.map((effect) => t(AUTO_EFFECT_LABELS[effect]))
							.join(", ")}
					</KeyValue>
				) : null}
				{flag.status === "open" ? (
					<KeyValue label={t("panel.assignee")}>
						{flag.assignedTo === null
							? t("queue.unassigned")
							: flag.assignedTo === viewerId
								? t("queue.me")
								: t("risk.anotherModerator")}
					</KeyValue>
				) : null}
				{flag.reviewedAt ? (
					<KeyValue label={t("risk.decidedAt")}>
						{format(flag.reviewedAt)}
					</KeyValue>
				) : null}
				{flag.resolution !== "none" ? (
					<KeyValue label={t("risk.resolutionLabel")}>
						{t(RESOLUTION_LABELS[flag.resolution])}
					</KeyValue>
				) : null}
			</dl>
			{flag.resolutionNote ? (
				<p className="whitespace-pre-wrap break-words rounded-lg bg-canvas p-3 text-ink text-sm">
					{flag.resolutionNote}
				</p>
			) : null}

			{flag.status === "open" && flag.assignedTo === null ? (
				<div className="space-y-2">
					<button
						type="button"
						onClick={() => claim.mutate(flag.id)}
						disabled={claim.isPending}
						className="h-10 w-full rounded-lg border border-line-strong bg-surface px-4 font-semibold text-ink text-sm hover:bg-subtle focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-60"
					>
						{claim.isPending ? t("panel.claiming") : t("panel.claim")}
					</button>
					{claim.isError ? (
						<PanelError error={claim.error} fallback={t("panel.claimError")} />
					) : null}
				</div>
			) : null}

			<PanelSection
				title={t("risk.subject", {
					type: t(RISK_SUBJECT_LABELS[flag.subjectType]),
				})}
			>
				<SubjectBlock subject={subject} fallbackLabel={flag.subjectLabel} />
			</PanelSection>

			<PanelSection title={t("risk.evidence")}>
				{evidenceRows.length === 0 ? (
					<p className="text-ink-muted text-sm">{t("risk.noEvidence")}</p>
				) : (
					<dl className="space-y-1.5 rounded-lg border border-line p-3">
						{evidenceRows.map((row) => {
							const value = evidenceValue(row.value, locale);
							return (
								<KeyValue key={row.label} label={row.label}>
									{"key" in value ? t(`risk.value.${value.key}`) : value.text}
								</KeyValue>
							);
						})}
					</dl>
				)}
			</PanelSection>

			{relatedFlags.length > 0 ? (
				<PanelSection title={t("risk.related")}>
					<ul className="divide-y divide-line rounded-lg border border-line">
						{relatedFlags.map((related) => (
							<li key={related.id} className="px-3 py-2 text-sm">
								<Link
									href={panelHref({ type: "risk", id: related.id })}
									scroll={false}
									className={LINK}
								>
									{related.subjectLabel ??
										t(RISK_SUBJECT_LABELS[related.subjectType])}
								</Link>
								<p className="text-ink-muted text-xs">
									<TranslatedCode label={detailLabel("risk", related.signal)} />{" "}
									· {related.score}
								</p>
							</li>
						))}
					</ul>
				</PanelSection>
			) : null}

			{moderationHistory.length > 0 ? (
				<PanelSection title={t("risk.history")}>
					<ul className="space-y-1 text-sm">
						{moderationHistory.slice(0, 10).map((entry) => {
							const label = logActionLabel(entry.action);
							return (
								<li key={entry.id} className="flex justify-between gap-3">
									<span className="min-w-0 text-ink">
										{"raw" in label ? label.raw : tRoot(label.key)}
									</span>
									<span className="shrink-0 text-ink-muted text-xs">
										{format(entry.createdAt)}
									</span>
								</li>
							);
						})}
					</ul>
				</PanelSection>
			) : null}

			{choices.length > 0 ? (
				<RiskDecisionForm
					flagId={flag.id}
					choices={choices}
					subject={subject}
					isAdmin={isAdmin}
					releasesHold={flag.autoEffects?.includes("payout_hold") ?? false}
					onDecided={onDecided}
				/>
			) : null}
		</div>
	);
}

function SubjectBlock({
	subject,
	fallbackLabel,
}: {
	subject: RiskSubjectView | null;
	fallbackLabel: string | null;
}) {
	const t = useTranslations("ModerationConsole");
	const box = "space-y-2 rounded-lg border border-line p-3";
	if (!subject)
		return (
			<div className={box}>
				<p className="font-semibold text-ink text-sm">{fallbackLabel ?? "—"}</p>
			</div>
		);

	if (subject.type === "user")
		return (
			<div className={box}>
				<p className="font-semibold text-ink text-sm">
					{subject.name ?? subject.id}
				</p>
				<dl className="space-y-1">
					{subject.accountAgeDays !== null ? (
						<KeyValue label={t("risk.accountAge")}>
							{t("risk.days", { count: subject.accountAgeDays })}
						</KeyValue>
					) : null}
					{subject.level !== null ? (
						<KeyValue label={t("risk.level")}>
							{t("level", { level: subject.level })}
						</KeyValue>
					) : null}
				</dl>
				{subject.shops.length > 0 ? (
					<ul className="space-y-1 text-sm">
						{subject.shops.map((shop) => (
							<li key={shop.id}>
								<Link href={shopHref(shop.id)} className={LINK}>
									{shop.name ?? shop.id}
									<ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
								</Link>
								{shop.level !== null ? (
									<span className="ml-2 text-ink-muted text-xs">
										{t("level", { level: shop.level })}
									</span>
								) : null}
							</li>
						))}
					</ul>
				) : (
					<p className="text-ink-muted text-xs">{t("risk.noShop")}</p>
				)}
			</div>
		);

	if (subject.type === "shop")
		return (
			<div className={box}>
				<p className="font-semibold text-ink text-sm">
					{subject.name ?? subject.id}
				</p>
				<dl className="space-y-1">
					{subject.level !== null ? (
						<KeyValue label={t("risk.level")}>
							{t("level", { level: subject.level })}
						</KeyValue>
					) : null}
					{subject.status ? (
						<KeyValue label={t("reports.standing")}>
							{subject.status === "suspended"
								? t("reports.suspended")
								: subject.status === "closed"
									? t("reports.closed")
									: t("reports.active")}
						</KeyValue>
					) : null}
					<KeyValue label={t("risk.cancellationRate")}>
						{subject.sellerCancellationRate === null
							? "—"
							: `${Math.round(subject.sellerCancellationRate * 100)} %`}
					</KeyValue>
					{subject.openDisputes !== null ? (
						<KeyValue label={t("risk.openDisputes")}>
							{subject.openDisputes}
						</KeyValue>
					) : null}
				</dl>
				<Link href={shopHref(subject.id)} className={`${LINK} text-sm`}>
					{t("reports.openShop")}
					<ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
				</Link>
			</div>
		);

	return (
		<div className={box}>
			<p className="font-semibold text-ink text-sm">
				{subject.label ?? fallbackLabel ?? "—"}
			</p>
			{subject.linkedShops.length > 0 ? (
				<ul className="space-y-1 text-sm">
					{subject.linkedShops.map((id) => (
						<li key={id}>
							<Link href={shopHref(id)} className={LINK}>
								{t("risk.linkedShop", { id: id.slice(-6) })}
								<ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
							</Link>
						</li>
					))}
				</ul>
			) : null}
			{subject.linkedUsers.length > 0 ? (
				<p className="text-ink-muted text-xs">
					{t("risk.linkedAccounts", { count: subject.linkedUsers.length })}
				</p>
			) : null}
			{subject.linkedShops.length === 0 && subject.linkedUsers.length === 0 ? (
				<p className="text-ink-muted text-xs">{t("risk.noLinks")}</p>
			) : null}
		</div>
	);
}

function RiskDecisionForm({
	flagId,
	choices,
	subject,
	isAdmin,
	releasesHold,
	onDecided,
}: {
	flagId: string;
	choices: RiskDecisionChoice[];
	subject: RiskSubjectView | null;
	isAdmin: boolean;
	releasesHold: boolean;
	onDecided: (id: string) => void;
}) {
	const t = useTranslations("ModerationConsole");
	const decision = useRiskDecision();
	const [choice, setChoice] = useState<RiskDecisionChoice>(
		choices[0] ?? "dismiss",
	);
	const [note, setNote] = useState("");
	const [duration, setDuration] = useState<number | null>(7);
	const [confirming, setConfirming] = useState(false);
	const [touched, setTouched] = useState(false);
	const durations = durationChoices(choice, isAdmin);
	const body = riskDecisionBody(choice, {
		subject,
		note,
		durationDays: durations.length ? duration : null,
	});
	const name = `risk-decision-${flagId}`;
	const danger = choice !== "dismiss" && choice !== "monitor";

	const choose = (value: string) => {
		const next = choices.find((entry) => entry === value);
		if (!next) return;
		setChoice(next);
		setConfirming(false);
		if (!durationChoices(next, isAdmin).includes(duration)) setDuration(7);
	};

	return (
		<PanelSection
			title={t("decision.title")}
			className="border-line border-t pt-4"
		>
			<fieldset className="space-y-2">
				<legend className="sr-only">{t("decision.title")}</legend>
				{choices.map((entry) => (
					<DecisionOption
						key={entry}
						name={name}
						value={entry}
						checked={choice === entry}
						onChange={choose}
						title={t(RISK_DECISION_LABELS[entry].title)}
						body={
							entry === "dismiss" && releasesHold
								? `${t(RISK_DECISION_LABELS[entry].body)} ${t("risk.decision.releasesHold")}`
								: t(RISK_DECISION_LABELS[entry].body)
						}
						tone={
							entry === "dismiss" || entry === "monitor" ? "neutral" : "danger"
						}
					/>
				))}
			</fieldset>
			{durations.length > 0 ? (
				<div className="space-y-1.5">
					<label
						htmlFor={`${name}-duration`}
						className="font-semibold text-ink-soft text-sm"
					>
						{t("risk.decision.duration")}
					</label>
					<select
						id={`${name}-duration`}
						value={duration === null ? "" : String(duration)}
						onChange={(event) => {
							setDuration(
								event.target.value ? Number(event.target.value) : null,
							);
							setConfirming(false);
						}}
						className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-ink text-sm focus-visible:outline-2 focus-visible:outline-brand"
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
				</div>
			) : null}
			<DecisionText
				id={`${name}-note`}
				label={t("risk.decision.note")}
				value={note}
				onChange={(value) => {
					setNote(value);
					setConfirming(false);
				}}
				required={needsNote(choice)}
				max={2000}
				placeholder={t("risk.decision.notePlaceholder")}
				error={touched && !body ? t("risk.decision.noteRequired") : null}
			/>
			{decision.isError ? (
				<PanelError error={decision.error} fallback={t("decision.failed")} />
			) : null}
			<ConfirmApply
				confirming={confirming}
				pending={decision.isPending}
				danger={danger}
				applyLabel={t("decision.apply")}
				confirmText={t(`risk.decision.confirm.${choice}`)}
				confirmLabel={t("decision.confirm")}
				onApply={() => {
					setTouched(true);
					if (body) setConfirming(true);
				}}
				onCancel={() => setConfirming(false)}
				onConfirm={() => {
					if (!body) return;
					decision.mutate(
						{ id: flagId, body },
						{ onSuccess: () => onDecided(flagId) },
					);
				}}
			/>
			<p className="text-ink-muted text-xs">
				{danger ? t("risk.decision.sanctionFootnote") : t("decision.logged")}
			</p>
		</PanelSection>
	);
}
