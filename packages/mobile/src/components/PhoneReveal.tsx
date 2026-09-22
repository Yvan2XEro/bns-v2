import { router, usePathname } from "expo-router";
import {
	ActivityIndicator,
	Linking,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useRevealContactPhone } from "@/src/hooks/useContactPhone";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useAuth } from "@/src/lib/auth";
import { getAuthModalParams } from "@/src/lib/authRedirect";
import { useTranslation } from "@/src/lib/i18n";

interface PhoneRevealProps {
	listingId: string;
}

export function PhoneReveal({ listingId }: PhoneRevealProps) {
	const { user } = useAuth();
	const pathname = usePathname();
	const { t } = useTranslation();
	const isDark = useColorScheme() === "dark";
	const reveal = useRevealContactPhone(listingId);
	const phone = reveal.data?.phone;

	const surface = {
		backgroundColor: isDark ? "#1e293b" : "#f1f5f9",
		borderColor: isDark ? "#1e3a5f" : "#e2e8f0",
	};
	const accent = isDark ? "#3b82f6" : "#1e40af";

	const onReveal = () => {
		if (!user) {
			router.push({
				pathname: "/auth/login",
				params: getAuthModalParams(pathname),
			});
			return;
		}
		reveal.mutate();
	};

	if (phone) {
		return (
			<Pressable
				onPress={() => Linking.openURL(`tel:${phone}`)}
				accessibilityRole="button"
				accessibilityLabel={`${t("listing.callSeller")} ${phone}`}
				style={[styles.btn, surface]}
			>
				<Text style={[styles.text, { color: accent }]}>📞 {phone}</Text>
			</Pressable>
		);
	}

	return (
		<View>
			<Pressable
				onPress={onReveal}
				disabled={reveal.isPending}
				accessibilityRole="button"
				accessibilityLabel={t("listing.phoneReveal")}
				accessibilityState={{ disabled: reveal.isPending }}
				style={[styles.btn, surface]}
			>
				{reveal.isPending ? (
					<ActivityIndicator size="small" color={accent} />
				) : (
					<Text style={[styles.text, { color: accent }]}>
						📞 {t("listing.phoneReveal")}
					</Text>
				)}
			</Pressable>
			{reveal.error && (
				<Text style={styles.error}>{resolveErrorMessage(reveal.error, t)}</Text>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	btn: {
		flexDirection: "row",
		alignItems: "center",
		borderRadius: 8,
		borderWidth: 1,
		minHeight: 44,
		paddingHorizontal: 12,
		paddingVertical: 10,
	},
	text: { fontSize: 14, fontWeight: "600" },
	error: { color: "#dc2626", fontSize: 12, marginTop: 4 },
});
