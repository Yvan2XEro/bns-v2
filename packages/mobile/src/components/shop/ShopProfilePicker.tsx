import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "@/src/lib/i18n";
import { SHOP_PROFILES, type ShopProfile } from "@/src/lib/listingKind";
import { useShopTheme } from "./theme";

const ICONS: Record<ShopProfile, keyof typeof Ionicons.glyphMap> = {
	store: "storefront-outline",
	agency: "business-outline",
	employer: "briefcase-outline",
	provider: "construct-outline",
};

/**
 * The kind of business, as four rows: a shop, an agency, a recruiter or a
 * service provider. One radio group, read as such by a screen reader.
 */
export function ShopProfilePicker({
	value,
	onChange,
	disabled = false,
}: {
	value: ShopProfile;
	onChange: (profile: ShopProfile) => void;
	disabled?: boolean;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();

	return (
		<View style={styles.list} accessibilityRole="radiogroup">
			{SHOP_PROFILES.map((profile) => {
				const on = value === profile;
				return (
					<Pressable
						key={profile}
						onPress={() => onChange(profile)}
						disabled={disabled}
						accessibilityRole="radio"
						accessibilityState={{ checked: on, disabled }}
						style={[
							styles.row,
							{
								borderColor: on ? c.primary : c.border,
								backgroundColor: on ? c.primarySoft : c.card,
								opacity: disabled ? 0.6 : 1,
							},
						]}
					>
						<Ionicons
							name={ICONS[profile]}
							size={22}
							color={on ? c.primary : c.muted}
						/>
						<View style={styles.texts}>
							<Text style={[styles.name, { color: c.text }]}>
								{t(`shopProfile.name.${profile}`)}
							</Text>
							<Text style={[styles.description, { color: c.muted }]}>
								{t(`shopProfile.description.${profile}`)}
							</Text>
						</View>
					</Pressable>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	list: { gap: 8 },
	row: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 12,
		padding: 12,
		borderRadius: 12,
		borderWidth: 1.5,
	},
	texts: { flex: 1, gap: 2 },
	name: { fontSize: 15, fontWeight: "700" },
	description: { fontSize: 13, lineHeight: 18 },
});
