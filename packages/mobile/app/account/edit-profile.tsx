import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAlert } from "@/src/contexts/AlertContext";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";

export default function EditProfileScreen() {
	const isDark = useColorScheme() === "dark";
	const { user, refreshUser } = useAuth();
	const { showSuccess, showError, showAlert } = useAlert();

	const [name, setName] = useState(user?.name ?? "");
	const [bio, setBio] = useState(user?.bio ?? "");
	const [phone, setPhone] = useState(user?.phone ?? "");
	const [location, setLocation] = useState(user?.location ?? "");

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";

	const { mutate: save, isPending } = useMutation({
		mutationFn: () =>
			api.patch(`/api/users/${user?.id}`, { name, bio, phone, location }),
		onSuccess: async () => {
			await refreshUser();
			showSuccess(
				"Profil mis à jour",
				"Vos informations ont été enregistrées.",
			);
			router.back();
		},
		onError: (err: any) => showError("Erreur", err.message),
	});

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: bg }]}
		>
			<View style={[styles.header, { borderBottomColor: borderColor }]}>
				<Pressable onPress={() => router.back()}>
					<Ionicons name="arrow-back" size={22} color={textColor} />
				</Pressable>
				<Text style={[styles.headerTitle, { color: textColor }]}>
					Modifier le profil
				</Text>
				<Pressable onPress={() => save()} disabled={isPending}>
					{isPending ? (
						<ActivityIndicator color={primaryColor} />
					) : (
						<Text style={[styles.saveBtn, { color: primaryColor }]}>
							Sauvegarder
						</Text>
					)}
				</Pressable>
			</View>

			<KeyboardAwareScrollView
				contentContainerStyle={styles.scroll}
				keyboardShouldPersistTaps="handled"
				bottomOffset={80}
			>
				{/* Avatar */}
				<View style={styles.avatarSection}>
					{user?.avatar?.url ? (
						<Image
							source={{ uri: user?.avatar?.url }}
							style={styles.avatar}
							contentFit="cover"
						/>
					) : (
						<View
							style={[
								styles.avatarPlaceholder,
								{ backgroundColor: isDark ? "#1e3a5f" : "#dbeafe" },
							]}
						>
							<Text style={[styles.avatarLetter, { color: primaryColor }]}>
								{user?.name?.[0]?.toUpperCase()}
							</Text>
						</View>
					)}
					<Pressable
						style={[styles.changeAvatarBtn, { backgroundColor: primaryColor }]}
						onPress={() =>
							showAlert(
								"Photo de profil",
								"Choisir depuis la galerie ou prendre une photo",
								undefined,
								"info",
							)
						}
					>
						<Ionicons name="camera" size={14} color="#fff" />
						<Text style={styles.changeAvatarText}>Changer</Text>
					</Pressable>
				</View>

				{/* Verification banner */}
				{user?.verified ? (
					<View
						style={[
							styles.banner,
							{
								backgroundColor: isDark ? "#0f2a1a" : "#f0fdf4",
								borderColor: "#16a34a",
							},
						]}
					>
						<Ionicons name="checkmark-circle" size={18} color="#16a34a" />
						<Text style={[styles.bannerText, { color: "#16a34a" }]}>
							Compte vérifié ✓
						</Text>
					</View>
				) : (
					<View
						style={[
							styles.banner,
							{
								backgroundColor: isDark ? "#162032" : "#eff6ff",
								borderColor: primaryColor,
							},
						]}
					>
						<Ionicons
							name="information-circle"
							size={18}
							color={primaryColor}
						/>
						<Text style={[styles.bannerText, { color: primaryColor, flex: 1 }]}>
							Vérifiez votre compte pour instaurer la confiance avec les
							acheteurs
						</Text>
					</View>
				)}

				{/* Fields */}
				{[
					{
						label: "Nom complet *",
						value: name,
						set: setName,
						placeholder: "Jean Dupont",
						keyboard: "default",
					},
					{
						label: "Bio",
						value: bio,
						set: setBio,
						placeholder: "Décrivez-vous...",
						multiline: true,
					},
					{
						label: "Téléphone",
						value: phone,
						set: setPhone,
						placeholder: "+237 6XX XXX XXX",
						keyboard: "phone-pad",
					},
					{
						label: "Localisation",
						value: location,
						set: setLocation,
						placeholder: "Douala, Cameroun",
						keyboard: "default",
					},
				].map(({ label, value, set, placeholder, multiline, keyboard }) => (
					<View key={label} style={{ gap: 6 }}>
						<Text style={[styles.fieldLabel, { color: mutedColor }]}>
							{label}
						</Text>
						<TextInput
							value={value}
							onChangeText={set}
							placeholder={placeholder}
							placeholderTextColor={mutedColor}
							style={[
								styles.field,
								{ backgroundColor: cardBg, borderColor, color: textColor },
								multiline && styles.multiline,
							]}
							multiline={multiline}
							numberOfLines={multiline ? 4 : 1}
							keyboardType={(keyboard as any) ?? "default"}
						/>
					</View>
				))}
			</KeyboardAwareScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 16,
		paddingVertical: 14,
		borderBottomWidth: 1,
	},
	headerTitle: { fontSize: 17, fontFamily: Fonts.displayBold },
	saveBtn: { fontSize: 15, fontFamily: Fonts.displayBold },
	scroll: { padding: 20, gap: 16, paddingBottom: 40 },
	avatarSection: { alignItems: "center", gap: 10 },
	avatar: { width: 90, height: 90, borderRadius: 45 },
	avatarPlaceholder: {
		width: 90,
		height: 90,
		borderRadius: 45,
		alignItems: "center",
		justifyContent: "center",
	},
	avatarLetter: { fontSize: 34, fontFamily: Fonts.displayBold },
	changeAvatarBtn: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		borderRadius: 20,
		paddingHorizontal: 14,
		paddingVertical: 7,
	},
	changeAvatarText: {
		color: "#fff",
		fontSize: 13,
		fontFamily: Fonts.bodySemibold,
	},
	banner: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		borderRadius: 10,
		borderWidth: 1,
		padding: 12,
	},
	bannerText: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.body },
	fieldLabel: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	field: {
		borderRadius: 10,
		borderWidth: 1.5,
		paddingHorizontal: 12,
		paddingVertical: 11,
		fontSize: 15,
		fontFamily: Fonts.body,
	},
	multiline: { minHeight: 100, textAlignVertical: "top" },
});
