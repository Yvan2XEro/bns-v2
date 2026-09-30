"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { useDocumentUrl } from "~/hooks/use-moderation-verification";
import { resolveErrorMessage } from "~/lib/apiError";
import type { ReviewerDocumentMeta } from "~/lib/verification";
import { documentUrlIsStale } from "~/lib/verification-decision";

const STALE_CHECK_INTERVAL_MS = 5000;

/**
 * Every open is a logged view of a real person's document, so a URL is
 * requested only on an explicit click, never prefetched, and never kept
 * around once the reviewer switches documents.
 */
export function DocumentViewer({
	documents,
}: {
	documents: ReviewerDocumentMeta[];
}) {
	const t = useTranslations("Moderation");
	const tRoot = useTranslations();
	const [activeId, setActiveId] = useState<string | null>(
		documents[0]?.id ?? null,
	);
	const documentUrl = useDocumentUrl();
	const active = documents.find((doc) => doc.id === activeId) ?? null;

	// While the reviewer keeps this document open, the 60-second signed URL is
	// re-requested a few seconds ahead of expiry rather than after the image
	// or PDF has already broken. Each re-request is its own logged view.
	const currentExpiresAt = documentUrl.data?.expiresAt;
	const mutate = documentUrl.mutate;
	useEffect(() => {
		if (!currentExpiresAt || !active) return;
		const timer = setInterval(() => {
			if (documentUrlIsStale(currentExpiresAt, new Date())) {
				mutate(active.id);
			}
		}, STALE_CHECK_INTERVAL_MS);
		return () => clearInterval(timer);
	}, [currentExpiresAt, active, mutate]);

	function selectDocument(id: string) {
		documentUrl.reset();
		setActiveId(id);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("review.documents.title")}</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex flex-wrap gap-2">
					{documents.map((doc) => (
						<Button
							key={doc.id}
							type="button"
							size="sm"
							variant={doc.id === activeId ? "default" : "outline"}
							onClick={() => selectDocument(doc.id)}
						>
							{doc.kind
								? t(`review.documentKind.${doc.kind}`)
								: t("review.documents.unknownKind")}
						</Button>
					))}
				</div>

				{active?.purgedAt && (
					<p className="rounded-lg bg-[#F1F5F9] px-3 py-2 text-[#64748B] text-sm">
						{t("review.documents.purged")}
					</p>
				)}

				{active && !active.purgedAt && !documentUrl.data && (
					<Button
						type="button"
						disabled={documentUrl.isPending}
						onClick={() => documentUrl.mutate(active.id)}
					>
						{documentUrl.isPending
							? t("review.documents.loading")
							: t("review.documents.view")}
					</Button>
				)}

				{documentUrl.isError && (
					<p
						role="alert"
						className="rounded-lg bg-red-50 px-3 py-2 text-red-700 text-sm"
					>
						{resolveErrorMessage(
							documentUrl.error,
							tRoot,
							t("review.documents.viewFailed"),
						)}
					</p>
				)}

				{documentUrl.data && active && (
					<>
						{documentUrl.data.mimeType.startsWith("image/") ? (
							<img
								src={documentUrl.data.url}
								alt={active.kind ? t(`review.documentKind.${active.kind}`) : ""}
								className="max-h-[640px] w-full rounded-xl border border-[#E2E8F0] object-contain"
							/>
						) : (
							<iframe
								src={documentUrl.data.url}
								title={
									active.kind
										? t(`review.documentKind.${active.kind}`)
										: t("review.documents.title")
								}
								className="h-[640px] w-full rounded-xl border border-[#E2E8F0]"
							/>
						)}
					</>
				)}
			</CardContent>
		</Card>
	);
}
