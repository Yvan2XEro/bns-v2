"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { LOG_ACTION_LABELS } from "~/lib/moderation-console";
import {
	hasLogFilters,
	isAccountId,
	isLogAction,
	isLogTargetType,
	LOG_TARGET_LABELS,
	type LogFilters,
	logHref,
} from "~/lib/moderation-log";

const FIELD =
	"h-10 w-full rounded-lg border border-line bg-surface px-3 text-ink text-sm placeholder:text-ink-ghost focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-brand";
const LABEL = "font-semibold text-ink-soft text-xs";

/**
 * The log's filters, applied together so a half-typed id never starts a
 * request. The parent remounts it on every URL change, so the fields always
 * start from what the URL says.
 */
export function LogFilterForm({
	pathname,
	filters,
}: {
	pathname: string;
	filters: LogFilters;
}) {
	const t = useTranslations("ModerationConsole");
	const router = useRouter();
	const [action, setAction] = useState<string>(filters.action ?? "");
	const [targetType, setTargetType] = useState<string>(
		filters.targetType ?? "",
	);
	const [targetId, setTargetId] = useState(filters.targetId ?? "");
	const [actor, setActor] = useState(filters.actor ?? "");
	const [from, setFrom] = useState(filters.from ?? "");
	const [to, setTo] = useState(filters.to ?? "");
	const [touched, setTouched] = useState(false);

	const actorInvalid = actor.trim() !== "" && !isAccountId(actor.trim());
	const rangeInvalid = from !== "" && to !== "" && from > to;

	const apply = () => {
		setTouched(true);
		if (actorInvalid || rangeInvalid) return;
		router.push(
			logHref(pathname, {
				action: isLogAction(action) ? action : undefined,
				targetType: isLogTargetType(targetType) ? targetType : undefined,
				targetId: targetId.trim().slice(0, 100) || undefined,
				actor: actor.trim() || undefined,
				from: from || undefined,
				to: to || undefined,
			}),
			{ scroll: false },
		);
	};

	return (
		<form
			aria-label={t("log.filtersLabel")}
			onSubmit={(event) => {
				event.preventDefault();
				apply();
			}}
			className="grid grid-cols-1 gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
		>
			<div className="space-y-1">
				<label htmlFor="log-action" className={LABEL}>
					{t("log.filter.action")}
				</label>
				<select
					id="log-action"
					value={action}
					onChange={(event) => setAction(event.target.value)}
					className={FIELD}
				>
					<option value="">{t("log.filter.anyAction")}</option>
					{Object.entries(LOG_ACTION_LABELS).map(([code, key]) => (
						<option key={code} value={code}>
							{t(key)}
						</option>
					))}
				</select>
			</div>
			<div className="space-y-1">
				<label htmlFor="log-target-type" className={LABEL}>
					{t("log.filter.targetType")}
				</label>
				<select
					id="log-target-type"
					value={targetType}
					onChange={(event) => setTargetType(event.target.value)}
					className={FIELD}
				>
					<option value="">{t("log.filter.anyTarget")}</option>
					{Object.entries(LOG_TARGET_LABELS).map(([code, key]) => (
						<option key={code} value={code}>
							{t(key)}
						</option>
					))}
				</select>
			</div>
			<div className="space-y-1">
				<label htmlFor="log-target-id" className={LABEL}>
					{t("log.filter.targetId")}
				</label>
				<input
					id="log-target-id"
					value={targetId}
					maxLength={100}
					onChange={(event) => setTargetId(event.target.value)}
					className={`${FIELD} font-mono`}
				/>
			</div>
			<div className="space-y-1">
				<label htmlFor="log-actor" className={LABEL}>
					{t("log.filter.actor")}
				</label>
				<input
					id="log-actor"
					value={actor}
					maxLength={24}
					onChange={(event) => setActor(event.target.value)}
					placeholder={t("log.filter.actorPlaceholder")}
					aria-invalid={touched && actorInvalid ? true : undefined}
					aria-describedby={
						touched && actorInvalid ? "log-actor-error" : undefined
					}
					className={`${FIELD} font-mono`}
				/>
				{touched && actorInvalid ? (
					<p id="log-actor-error" className="text-bad-ink text-xs">
						{t("log.filter.actorInvalid")}
					</p>
				) : null}
			</div>
			<div className="space-y-1">
				<label htmlFor="log-from" className={LABEL}>
					{t("log.filter.from")}
				</label>
				<input
					id="log-from"
					type="date"
					value={from}
					max={to || undefined}
					onChange={(event) => setFrom(event.target.value)}
					className={FIELD}
				/>
			</div>
			<div className="space-y-1">
				<label htmlFor="log-to" className={LABEL}>
					{t("log.filter.to")}
				</label>
				<input
					id="log-to"
					type="date"
					value={to}
					min={from || undefined}
					onChange={(event) => setTo(event.target.value)}
					aria-invalid={touched && rangeInvalid ? true : undefined}
					aria-describedby={
						touched && rangeInvalid ? "log-to-error" : undefined
					}
					className={FIELD}
				/>
				{touched && rangeInvalid ? (
					<p id="log-to-error" className="text-bad-ink text-xs">
						{t("log.filter.rangeInvalid")}
					</p>
				) : null}
			</div>
			<div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-3 xl:col-span-6">
				<button
					type="submit"
					className="h-10 rounded-lg bg-brand-fill px-4 font-semibold text-sm text-white hover:bg-brand-strong focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
				>
					{t("log.filter.apply")}
				</button>
				{hasLogFilters(filters) ? (
					<Link
						href={pathname}
						scroll={false}
						className="rounded font-semibold text-ink-soft text-sm hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-brand"
					>
						{t("log.filter.clear")}
					</Link>
				) : null}
			</div>
		</form>
	);
}
