import { Ionicons } from "@expo/vector-icons";
import { type ReactNode, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import type { ContractSnapshot } from "@/src/types/order";

function Section({ title, children }: { title: string; children: ReactNode }) {
	const c = useShopTheme();
	const [open, setOpen] = useState(false);
	return (
		<View style={[styles.section, { borderColor: c.border }]}>
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
}: {
	contract: ContractSnapshot;
	language: "fr" | "en";
	appLanguage: "fr" | "en";
	onLanguage: (next: "fr" | "en") => void;
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
				<Text style={[styles.heading, { color: c.text }]}>
					{t("checkout.preContract")}
				</Text>
				<Pressable
					onPress={() => onLanguage(language === "fr" ? "en" : "fr")}
					accessibilityRole="button"
					accessibilityLabel={toggle}
					style={styles.toggle}
				>
					<Text style={[styles.toggleText, { color: c.primary }]}>
						{toggle}
					</Text>
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
			<Section title={t("checkout.termsCod")}>
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
	heading: { fontSize: 16, fontFamily: Fonts.displayBold },
	toggle: { minHeight: 44, justifyContent: "center" },
	toggleText: {
		fontSize: 13,
		fontFamily: Fonts.bodySemibold,
		textDecorationLine: "underline",
	},
	section: {
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 12,
		paddingHorizontal: 12,
	},
	sectionHeader: {
		minHeight: 44,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	sectionTitle: { fontSize: 14, fontFamily: Fonts.bodySemibold, flex: 1 },
	sectionBody: { paddingBottom: 12, gap: 6 },
	text: { fontSize: 13, lineHeight: 19, fontFamily: Fonts.body },
});
