import { Ionicons } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";
import { useState } from "react";
import {
	ActivityIndicator,
	Linking,
	Pressable,
	type StyleProp,
	Text,
	type TextStyle,
	type ViewStyle,
} from "react-native";
import { useAlert } from "@/src/contexts/AlertContext";
import { useRevealContactPhone } from "@/src/hooks/useContactPhone";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useAuth } from "@/src/lib/auth";
import { getAuthModalParams } from "@/src/lib/authRedirect";
import { phoneDialUrl, sellerHasNoPhone } from "@/src/lib/callSeller";
import { useTranslation } from "@/src/lib/i18n";

/**
 * "Appeler" goes through the protected reveal (`POST …/contact-phone`: login,
 * rate limit, reveal log) and dials the number it answers. The reveal is a
 * mutation, so a second tap dials the number already in hand instead of
 * counting another reveal.
 */
export function CallSellerButton({
	listingId,
	style,
	textStyle,
	color,
}: {
	listingId: string;
	style: StyleProp<ViewStyle>;
	textStyle: StyleProp<TextStyle>;
	color: string;
}) {
	const { user } = useAuth();
	const pathname = usePathname();
	const { t } = useTranslation();
	const { showError } = useAlert();
	const reveal = useRevealContactPhone(listingId);
	const [unavailable, setUnavailable] = useState(false);

	if (unavailable) return null;

	const dial = (phone: string) => {
		Linking.openURL(phoneDialUrl(phone)).catch(() =>
			showError(t("listing.callSeller"), phone),
		);
	};

	const onPress = () => {
		if (!user) {
			router.push({
				pathname: "/auth/login",
				params: getAuthModalParams(pathname),
			});
			return;
		}
		if (reveal.data?.phone) return dial(reveal.data.phone);
		reveal.mutate(undefined, {
			onSuccess: ({ phone }) => dial(phone),
			onError: (error) => {
				if (sellerHasNoPhone(error)) setUnavailable(true);
				showError(t("listing.callSeller"), resolveErrorMessage(error, t));
			},
		});
	};

	return (
		<Pressable
			onPress={onPress}
			disabled={reveal.isPending}
			accessibilityRole="button"
			accessibilityLabel={t("listing.callSeller")}
			accessibilityState={{ disabled: reveal.isPending }}
			style={[style, { opacity: reveal.isPending ? 0.7 : 1 }]}
		>
			{reveal.isPending ? (
				<ActivityIndicator size="small" color={color} />
			) : (
				<Ionicons name="call-outline" size={18} color={color} />
			)}
			<Text style={[textStyle, { color }]}>{t("listing.call")}</Text>
		</Pressable>
	);
}
