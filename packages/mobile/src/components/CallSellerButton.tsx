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
import { usePhoneGate } from "@/src/hooks/usePhoneGate";
import { ApiError } from "@/src/lib/api";
import { ERROR_CODES, resolveErrorMessage } from "@/src/lib/apiError";
import { useAuth } from "@/src/lib/auth";
import { getAuthModalParams } from "@/src/lib/authRedirect";
import { phoneDialUrl, sellerHasNoPhone } from "@/src/lib/callSeller";
import { useTranslation } from "@/src/lib/i18n";
import { whatsappChatUrl } from "../../../api/src/contracts/whatsapp";

/**
 * "Appeler" goes through the protected reveal (`POST …/contact-phone`: login,
 * rate limit, reveal log), then offers a call or a WhatsApp chat — where most
 * buyers and sellers actually talk. The reveal is a mutation, so a second tap
 * reuses the number already in hand instead of counting another reveal.
 */
export function CallSellerButton({
	listingId,
	style,
	textStyle,
	color,
	whatsappMessage,
}: {
	listingId: string;
	/** Prefilled in the WhatsApp chat offered next to the call. */
	whatsappMessage?: string;
	style: StyleProp<ViewStyle>;
	textStyle: StyleProp<TextStyle>;
	color: string;
}) {
	const { user } = useAuth();
	const pathname = usePathname();
	const { t } = useTranslation();
	const { showError, showAlert } = useAlert();
	const reveal = useRevealContactPhone(listingId);
	// A seller's number is shown only to an account with a verified phone.
	const { requirePhone } = usePhoneGate();
	const [unavailable, setUnavailable] = useState(false);

	if (unavailable) return null;

	const dial = (phone: string) => {
		Linking.openURL(phoneDialUrl(phone)).catch(() =>
			showError(t("listing.callSeller"), phone),
		);
	};

	const contact = (phone: string) => {
		const whatsapp = whatsappChatUrl(phone, whatsappMessage);
		if (!whatsapp) return dial(phone);
		showAlert(t("listing.contactBy"), phone, [
			{ text: t("listing.call"), onPress: () => dial(phone) },
			{
				text: t("listing.whatsapp"),
				onPress: () => {
					Linking.openURL(whatsapp).catch(() => dial(phone));
				},
			},
			{ text: t("common.cancel"), style: "cancel" },
		]);
	};

	const onPress = () => {
		if (!user) {
			router.push({
				pathname: "/auth/login",
				params: getAuthModalParams(pathname),
			});
			return;
		}
		if (reveal.data?.phone) return contact(reveal.data.phone);
		if (!requirePhone("revealPhone")) return;
		reveal.mutate(undefined, {
			onSuccess: ({ phone }) => contact(phone),
			onError: (error) => {
				// The phone was unverified since the account was last read.
				if (
					error instanceof ApiError &&
					error.code === ERROR_CODES.phoneRequired
				) {
					requirePhone("revealPhone");
					return;
				}
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
