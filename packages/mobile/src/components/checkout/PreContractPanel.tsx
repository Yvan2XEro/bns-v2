import { Ionicons } from "@expo/vector-icons";
import { type ReactNode, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import type { ContractSnapshot, PaymentMethod } from "@/src/types/order";
import { inkOf } from "./fill";

function Section({ title, children }: { title: string; children: ReactNode }) {
	const c = useShopTheme();
	const [open, setOpen] = useState(false);
	return (
		<View
			style={[
				styles.section,
				{ borderColor: c.border, backgroundColor: c.card },
			]}
		>
			<Pressable
				onPress={() => setOpen(!open)}
				accessibilityRole="button"
				accessibilityLabel={title}
				accessibilityState={{ expanded: open }}
				style={styles.sectionHeader}
			>
				<Text style={[styles.sectionTitle, { color: c.text }]}>{title}</Text>
				<Ionicons
					name={open ? "chevron-up" : "chevron-down"}
					size={18}
					color={c.muted}
				/>
			</Pressable>
			{open ? <View style={styles.sectionBody}>{children}</View> : null}
		</View>
	);
}

/**
 * The art. 15 pre-contract, read from the quote's own snapshot — the same
 * object stored on the order — in either language. Section titles follow the
 * app; the contract's text follows the toggle.
 */
export function PreContractPanel({
	contract,
	language,
	appLanguage,
	onLanguage,
	paymentMethod = "cod",
}: {
	contract: ContractSnapshot;
	language: "fr" | "en";
	appLanguage: "fr" | "en";
	onLanguage: (next: "fr" | "en") => void;
	/** Names the terms block after the method the buyer actually chose. */
	paymentMethod?: PaymentMethod;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const { seller, platform, withdrawal } = contract;
	const text = [styles.text, { color: c.body }];
	const toggle =
		language === appLanguage
			? t("checkout.languageToggle")
			: t("checkout.languageToggleBack");

	return (
		<View style={{ gap: 8 }}>
			<View style={styles.header}>
				<Text
					style={[styles.heading, { color: c.text }]}
					accessibilityRole="header"
				>
					{t("checkout.preContract")}
				</Text>
				<Pressable
					onPress={() => onLanguage(language === "fr" ? "en" : "fr")}
					accessibilityRole="button"
					accessibilityLabel={toggle}
					style={styles.toggle}
				>
					<Text style={[styles.toggleText, { color: inkOf(c) }]}>{toggle}</Text>
				</Pressable>
			</View>
			<Section title={t("checkout.sellerIdentity")}>
				<Text style={[text, { fontFamily: Fonts.bodySemibold }]}>
					{`${seller.name} (@${seller.handle})${seller.city ? ` — ${seller.city}` : ""}`}
				</Text>
				{seller.phone ? (
					<Text style={text}>
						{t("checkout.sellerPhone", { value: seller.phone })}
					</Text>
				) : null}
				{seller.rccm ? (
					<Text style={text}>
						{t("checkout.sellerRccm", { value: seller.rccm })}
					</Text>
				) : null}
				{seller.niu ? (
					<Text style={text}>
						{t("checkout.sellerNiu", { value: seller.niu })}
					</Text>
				) : null}
				<Text style={text}>
					{t("checkout.platformRole", { platform: platform.legalName })}
				</Text>
			</Section>
			<Section
				title={t(
					paymentMethod === "mobile_money"
						? "checkout.termsProtected"
						: "checkout.termsCod",
				)}
			>
				{contract.terms[language].map((term) => (
					<Text key={term} style={text}>{`• ${term}`}</Text>
				))}
			</Section>
			<Section title={t("checkout.withdrawalInfo")}>
				<Text style={text}>
					{t("checkout.withdrawalDays", { days: withdrawal.days })}
				</Text>
				<Text style={text}>{withdrawal.howTo[language]}</Text>
				<Text style={text}>{withdrawal.costs[language]}</Text>
			</Section>
			<Section title={t("checkout.salesTerms")}>
				<Text style={text}>{contract.salesTerms[language]}</Text>
			</Section>
			<Section title={t("checkout.complaints")}>
				<Text style={text}>{contract.complaints[language]}</Text>
			</Section>
		</View>
	);
}

const styles = StyleSheet.create({
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	heading: {
		flexShrink: 1,
		fontSize: 18,
		lineHeight: 23,
		fontFamily: Fonts.displayBold,
	},
	toggle: { minHeight: 44, justifyContent: "center", paddingLeft: 12 },
	toggleText: {
		fontSize: 15,
		lineHeight: 22,
		fontFamily: Fonts.bodySemibold,
		textDecorationLine: "underline",
	},
	section: {
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 12,
		paddingHorizontal: 14,
	},
	sectionHeader: {
		minHeight: 48,
		gap: 8,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	sectionTitle: {
		fontSize: 15,
		lineHeight: 22,
		fontFamily: Fonts.bodySemibold,
		flex: 1,
	},
	sectionBody: { paddingBottom: 14, gap: 8 },
	text: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.body },
});
