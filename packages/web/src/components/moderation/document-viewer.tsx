"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { useDocumentUrl } from "~/hooks/use-moderation-verification";
import { resolveErrorMessage } from "~/lib/apiError";
import type {
	ReviewerDocumentMeta,
	SignedDocumentUrl,
} from "~/lib/verification";
import { documentUrlIsStale } from "~/lib/verification-decision";

const STALE_CHECK_INTERVAL_MS = 5000;

/**
 * Every open is a logged view of a real person's document, so nothing is
 * fetched until the reviewer clicks "View". From then on, choosing a document
 * tab is itself the explicit request to see it: it opens straight away, once.
 *
 * A document already shown stays mounted (hidden) for the life of this
 * screen, so switching back is instant and costs neither a reload nor another
 * logged view: a loaded image does not need its signed URL any more. Nothing
 * is written to storage; leaving the screen drops it all.
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
	const [loaded, setLoaded] = useState<Record<string, SignedDocumentUrl>>({});
	const [viewing, setViewing] = useState(false);
	const documentUrl = useDocumentUrl();
	const active = documents.find((doc) => doc.id === activeId) ?? null;
	const activeUrl = active ? loaded[active.id] : undefined;
	const pendingForActive =
		documentUrl.isPending && documentUrl.variables === active?.id;
	const errorForActive =
		documentUrl.isError && documentUrl.variables === active?.id;

	const mutate = documentUrl.mutate;
	function open(docId: string) {
		setViewing(true);
		mutate(docId, {
			onSuccess: (result) =>
				setLoaded((current) => ({ ...current, [docId]: result })),
		});
	}

	function selectDocument(id: string) {
		setActiveId(id);
		const doc = documents.find((d) => d.id === id);
		if (viewing && doc && !doc.purgedAt && !loaded[id]) open(id);
	}

	// A PDF viewer may fetch more of the file while it is read, so the open
	// PDF's 60-second URL is renewed a few seconds ahead of expiry. An image is
	// complete once shown and is never renewed. Each renewal is a logged view.
	const renewId =
		active && activeUrl && !activeUrl.mimeType.startsWith("image/")
			? active.id
			: null;
	const renewExpiresAt = activeUrl?.expiresAt;
	useEffect(() => {
		if (!renewId || !renewExpiresAt) return;
		const timer = setInterval(() => {
			if (documentUrlIsStale(renewExpiresAt, new Date())) {
				mutate(renewId, {
					onSuccess: (result) =>
						setLoaded((current) => ({ ...current, [renewId]: result })),
				});
			}
		}, STALE_CHECK_INTERVAL_MS);
		return () => clearInterval(timer);
	}, [renewId, renewExpiresAt, mutate]);

	const labelOf = (doc: ReviewerDocumentMeta) =>
		doc.kind
			? t(`review.documentKind.${doc.kind}`)
			: t("review.documents.unknownKind");

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
							{labelOf(doc)}
						</Button>
					))}
				</div>

				{active?.purgedAt && (
					<p className="rounded-lg bg-subtle px-3 py-2 text-ink-muted text-sm">
						{t("review.documents.purged")}
					</p>
				)}

				{active && !active.purgedAt && !activeUrl && (
					<Button
						type="button"
						disabled={pendingForActive}
						onClick={() => open(active.id)}
					>
						{pendingForActive
							? t("review.documents.loading")
							: t("review.documents.view")}
					</Button>
				)}

				{errorForActive && (
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

				{documents.map((doc) => {
					const signed = loaded[doc.id];
					if (!signed) return null;
					const hidden = doc.id !== activeId;
					return signed.mimeType.startsWith("image/") ? (
						<img
							key={doc.id}
							src={signed.url}
							alt={labelOf(doc)}
							hidden={hidden}
							className="max-h-[640px] w-full rounded-xl border border-line object-contain"
						/>
					) : (
						<iframe
							key={doc.id}
							src={signed.url}
							title={labelOf(doc)}
							hidden={hidden}
							className="h-[640px] w-full rounded-xl border border-line"
						/>
					);
				})}
			</CardContent>
		</Card>
	);
}
