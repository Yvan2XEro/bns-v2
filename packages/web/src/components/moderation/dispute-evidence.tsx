"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEvidenceUrl } from "~/hooks/use-moderation-disputes";
import { resolveErrorMessage } from "~/lib/apiError";
import type { DisputeView } from "../../../../api/src/contracts/disputes";

type Evidence = DisputeView["evidence"][number];

/**
 * Every open is a logged view, so a signed URL is requested on click only.
 * Staff-visibility rows are listed for the moderator and marked as such; the
 * wall that hides them from the parties is the server's.
 */
export function DisputeEvidence({
	disputeId,
	evidence,
}: {
	disputeId: string;
	evidence: Evidence[];
}) {
	const t = useTranslations("ModerationDisputes");
	const tRoot = useTranslations();
	if (!evidence.length) {
		return <p className="text-[#64748B] text-sm">{t("noEvidence")}</p>;
	}
	return (
		<ul aria-label={tRoot("Disputes.evidenceTitle")} className="space-y-3">
			{evidence.map((item) => (
				<EvidenceItem key={item.id} disputeId={disputeId} item={item} />
			))}
		</ul>
	);
}

function EvidenceItem({
	disputeId,
	item,
}: {
	disputeId: string;
	item: Evidence;
}) {
	const t = useTranslations("ModerationDisputes");
	const tRoot = useTranslations();
	const locale = useLocale();
	const signed = useEvidenceUrl(disputeId);

	return (
		<li
			data-visibility={item.visibility}
			className="rounded-xl border border-[#E2E8F0] bg-white p-3"
		>
			<div className="flex flex-wrap items-center gap-2 text-sm">
				<span className="font-medium text-[#0F172A]">
					{t(`evidenceKind.${item.kind}`)}
				</span>
				<span className="text-[#64748B]">
					{t("evidenceMeta", {
						by: t(`uploader.${item.uploadedByType}`),
						size: Math.max(1, Math.round(item.size / 1024)),
					})}
				</span>
				{item.visibility === "staff" ? (
					<span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-900 text-xs">
						{t("staffOnly")}
					</span>
				) : null}
				{item.sha256Reused ? (
					<span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-800 text-xs">
						{t("sha256Reused")}
					</span>
				) : null}
			</div>
			{item.capturedAt ? (
				<p className="mt-1 text-[#64748B] text-xs">
					{t("capturedAt", {
						date: new Intl.DateTimeFormat(locale, {
							dateStyle: "medium",
							timeStyle: "short",
						}).format(new Date(item.capturedAt)),
					})}
				</p>
			) : null}
			{signed.data ? (
				signed.data.mimeType.startsWith("video/") ? (
					<video
						controls
						src={signed.data.url}
						className="mt-3 max-h-96 w-full rounded-lg"
					>
						<track kind="captions" />
					</video>
				) : signed.data.mimeType.startsWith("image/") ? (
					<a href={signed.data.url} target="_blank" rel="noreferrer">
						{/* biome-ignore lint/performance/noImgElement: short-lived signed URL, not optimisable */}
						<img
							src={signed.data.url}
							alt={t(`evidenceKind.${item.kind}`)}
							className="mt-3 max-h-96 rounded-lg"
						/>
					</a>
				) : (
					<a
						href={signed.data.url}
						target="_blank"
						rel="noreferrer"
						className="mt-3 inline-block text-[#1E40AF] text-sm underline"
					>
						{t("openFile")}
					</a>
				)
			) : (
				<button
					type="button"
					disabled={signed.isPending}
					onClick={() => signed.mutate(item.id)}
					className="mt-3 min-h-9 rounded-lg border border-[#CBD5E1] px-3 text-sm hover:bg-[#F8FAFC] disabled:opacity-50"
				>
					{t("viewEvidence")}
				</button>
			)}
			{signed.isError ? (
				<p role="alert" className="mt-2 text-red-700 text-sm">
					{resolveErrorMessage(signed.error, tRoot)}
				</p>
			) : null}
		</li>
	);
}
