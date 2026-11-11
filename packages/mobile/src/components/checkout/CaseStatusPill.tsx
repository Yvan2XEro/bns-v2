import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { type ShopPalette, useShopTheme } from "@/src/components/shop/theme";
import type { DisputeStatus, ReturnCaseStatus } from "@/src/lib/caseStatus";

export type CaseTone =
	| "progress"
	| "warning"
	| "success"
	| "danger"
	| "neutral";

const RETURN_TONES: Record<ReturnCaseStatus, CaseTone> = {
	requested: "progress",
	approved: "progress",
	awaiting_shipment: "progress",
	in_transit: "progress",
	received: "progress",
	inspected: "progress",
	refund_pending: "progress",
	disputed: "warning",
	refunded: "success",
	rejected: "danger",
	expired: "danger",
	cancelled: "neutral",
	closed: "neutral",
};

const DISPUTE_TONES: Record<DisputeStatus, CaseTone> = {
	open: "progress",
	awaiting_seller: "progress",
	under_review: "progress",
	awaiting_buyer: "warning",
	resolved_buyer: "success",
	resolved_split: "success",
	resolved_seller: "neutral",
	withdrawn: "neutral",
};

export function returnTone(status: ReturnCaseStatus): CaseTone {
	return RETURN_TONES[status] ?? "neutral";
}

export function disputeTone(status: DisputeStatus): CaseTone {
	return DISPUTE_TONES[status] ?? "neutral";
}

/** Background and text for a tone; every pair clears 4.5:1 in both themes. */
export function toneColors(c: ShopPalette, tone: CaseTone) {
	switch (tone) {
		case "progress":
			// Words on the tint: `link` by day (the shop's colour when branded),
			// running-text ink by night, where a brand link can sink on its tint.
			return { bg: c.primarySoft, fg: c.isDark ? c.body : c.link };
		case "warning":
			return { bg: c.warningSoft, fg: c.warningText };
		case "success":
			return { bg: c.successSoft, fg: c.successText };
		case "danger":
			return { bg: c.dangerSoft, fg: c.dangerText };
		default:
			return { bg: c.neutralSoft, fg: c.neutralText };
	}
}

/** A case's status as a tinted pill with a dot, so it is not colour alone. */
export function CaseStatusPill({
	label,
	tone,
}: {
	label: string;
	tone: CaseTone;
}) {
	const c = useShopTheme();
	const { bg, fg } = toneColors(c, tone);
	return (
		<View style={[styles.pill, { backgroundColor: bg }]}>
			<View style={[styles.dot, { backgroundColor: fg }]} />
			<Text style={[styles.text, { color: fg }]} numberOfLines={1}>
				{label}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	pill: {
		flexDirection: "row",
		alignItems: "center",
		alignSelf: "flex-start",
		gap: 6,
		borderRadius: 999,
		paddingHorizontal: 10,
		paddingVertical: 4,
		flexShrink: 1,
	},
	dot: { width: 6, height: 6, borderRadius: 3 },
	text: { fontSize: 12, fontFamily: Fonts.bodySemibold, flexShrink: 1 },
});
