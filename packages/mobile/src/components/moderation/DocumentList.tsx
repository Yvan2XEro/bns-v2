import { Image } from "expo-image";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useDocumentUrl } from "@/src/hooks/useModerationVerification";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import type {
	ModerationVerificationDetail,
	SignedDocumentUrl,
} from "@/src/types/api";
import { DecisionButton, InlineNotice, ModerationCard } from "./ModerationKit";
import { useModerationTheme } from "./theme";
import { tonesOf } from "./tones";

type DocumentMeta =
	ModerationVerificationDetail["request"]["documents"][number];

/**
 * Every open is a logged view of a real person's identity papers, so nothing
 * is fetched until the reviewer taps "View document". From then on, tapping
 * an image document's chip is itself the request to see it: it opens at once.
 * An image already shown stays mounted (hidden) while this screen is open, so
 * switching back is instant, with no reload and no second logged view.
 * Images render with `cachePolicy="none"`: kept in memory for this screen,
 * never written to the device. A PDF cannot render inline on native, so it
 * opens in the system browser, and only on its own tap.
 */
export function DocumentList({ documents }: { documents: DocumentMeta[] }) {
	const c = useModerationTheme();
	const k = tonesOf(c);
	const { t } = useTranslation();
	const [activeId, setActiveId] = useState<string | null>(
		documents[0]?.id ?? null,
	);
	const [loaded, setLoaded] = useState<Record<string, SignedDocumentUrl>>({});
	const [viewing, setViewing] = useState(false);
	const documentUrl = useDocumentUrl();
	const active = documents.find((doc) => doc.id === activeId) ?? null;
	const activeLoaded = active ? Boolean(loaded[active.id]) : false;
	const pendingForActive =
		documentUrl.isPending && documentUrl.variables === active?.id;
	const errorForActive =
		documentUrl.isError && documentUrl.variables === active?.id;

	function open(doc: DocumentMeta) {
		setViewing(true);
		documentUrl.mutate(doc.id, {
			onSuccess: (result) => {
				if (result.mimeType.startsWith("image/")) {
					setLoaded((current) => ({ ...current, [doc.id]: result }));
				} else {
					// A PDF cannot render inline: it opens in the browser, so it
					// is never opened without its own tap.
					void WebBrowser.openBrowserAsync(result.url);
				}
			},
		});
	}

	function selectDocument(id: string) {
		setActiveId(id);
		const doc = documents.find((d) => d.id === id);
		if (
			viewing &&
			doc &&
			!doc.purgedAt &&
			!loaded[id] &&
			// Reviewer metadata has no mime type; a PDF is known by its name.
			!/\.pdf$/i.test(doc.originalFilename ?? "")
		) {
			open(doc);
		}
	}

	const labelOf = (doc: DocumentMeta) =>
		doc.kind
			? t(`moderation.verifDocumentKind_${doc.kind}`)
			: t("moderation.verifDocumentUnknownKind");

	if (documents.length === 0) return null;

	return (
		<ModerationCard title={t("moderation.verifDocumentsTitle")}>
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				accessibilityRole="tablist"
			>
				<View style={styles.chips}>
					{documents.map((doc) => {
						const selected = doc.id === activeId;
						const label = labelOf(doc);
						return (
							<Pressable
								key={doc.id}
								accessibilityRole="tab"
								accessibilityLabel={label}
								accessibilityState={{ selected }}
								onPress={() => selectDocument(doc.id)}
								style={[
									styles.chip,
									{
										backgroundColor: selected ? k.selectedSoft : c.card,
										borderColor: selected ? k.linkText : c.border,
									},
								]}
							>
								<Text
									style={[
										styles.chipText,
										{
											color: selected ? k.linkText : c.text,
											fontFamily: selected
												? Fonts.bodyBold
												: Fonts.bodySemibold,
										},
									]}
								>
									{label}
								</Text>
							</Pressable>
						);
					})}
				</View>
			</ScrollView>

			{active?.purgedAt ? (
				<InlineNotice
					tone="neutral"
					text={t("moderation.verifDocumentPurged")}
				/>
			) : null}

			{active && !active.purgedAt && !activeLoaded ? (
				// Every open is logged, so it is an explicit, labelled tap.
				<DecisionButton
					variant="secondary"
					icon="eye-outline"
					label={t("moderation.verifDocumentView")}
					onPress={() => open(active)}
					pending={pendingForActive}
					grow={0}
				/>
			) : null}

			{errorForActive ? (
				<InlineNotice
					text={resolveErrorMessage(
						documentUrl.error,
						t,
						t("moderation.verifDocumentViewFailed"),
					)}
				/>
			) : null}

			{documents.map((doc) => {
				const signed = loaded[doc.id];
				if (!signed) return null;
				return (
					<Image
						key={doc.id}
						source={{ uri: signed.url }}
						cachePolicy="none"
						style={[
							styles.preview,
							{ backgroundColor: c.bg },
							doc.id !== activeId && styles.hidden,
						]}
						contentFit="contain"
						accessibilityLabel={labelOf(doc)}
						accessibilityElementsHidden={doc.id !== activeId}
					/>
				);
			})}
		</ModerationCard>
	);
}

const styles = StyleSheet.create({
	chips: { flexDirection: "row", gap: 8 },
	chip: {
		borderRadius: 12,
		borderWidth: 1.5,
		paddingHorizontal: 14,
		minHeight: 48,
		alignItems: "center",
		justifyContent: "center",
	},
	chipText: { fontFamily: Fonts.body, fontSize: 15, lineHeight: 22 },
	preview: { width: "100%", height: 360, borderRadius: 12 },
	hidden: { display: "none" },
});
