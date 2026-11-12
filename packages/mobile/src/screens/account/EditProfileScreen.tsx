import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { router, useNavigation } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	type TextInputProps,
	View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { FormField } from "@/src/components/settings/FormField";
import {
	GroupedRow,
	GroupedSection,
	useGroupedColors,
} from "@/src/components/settings/Grouped";
import { SettingsHeader } from "@/src/components/settings/SettingsHeader";
import { UserAvatar } from "@/src/components/settings/UserAvatar";
import { LevelBadge } from "@/src/components/shop/LevelBadge";
import { useAlert } from "@/src/contexts/AlertContext";
import { useCloseScreen } from "@/src/contexts/DetailPaneContext";
import { useResponsive } from "@/src/hooks/useResponsive";
import { useMyShop } from "@/src/hooks/useShops";
import { api } from "@/src/lib/api";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useAuth } from "@/src/lib/auth";
import i18n, { useTranslation } from "@/src/lib/i18n";
import { createMediaUploadFormData } from "@/src/lib/mediaUpload";

function getErrorMessage(error: unknown, fallback: string): string {
	// `error instanceof Error` was always true for a failed request, so the
	// fallback never fired and users saw raw API text. resolveErrorMessage maps
	// the error code to translated copy and keeps the fallback for the rest.
	return resolveErrorMessage(error, (key) => i18n.t(key), fallback);
}

export function EditProfileScreen() {
	const { centeredContent } = useResponsive();
	const { user, refreshUser } = useAuth();
	const { showSuccess, showError, showAlert } = useAlert();
	const close = useCloseScreen("/(tabs)/account");
	const { t } = useTranslation();
	const { data: myShop } = useMyShop();
	const ownShop = myShop?.shop ?? null;

	const [name, setName] = useState(user?.name ?? "");
	const [bio, setBio] = useState(user?.bio ?? "");
	const [location, setLocation] = useState(user?.location ?? "");
	const [avatarUri, setAvatarUri] = useState<string | null>(null);
	const [avatarUploading, setAvatarUploading] = useState(false);
	const [nameError, setNameError] = useState<string | null>(null);

	// Leaving with unsaved edits asks first, whether by the back arrow, the
	// Android back button or the swipe. A successful save turns the guard off.
	const dirty =
		name !== (user?.name ?? "") ||
		bio !== (user?.bio ?? "") ||
		location !== (user?.location ?? "");
	const savedRef = useRef(false);
	const navigation = useNavigation();
	useEffect(() => {
		if (!dirty) return;
		// `beforeRemove` through expo-router's own navigation: the separate
		// @react-navigation package reads a provider that is never mounted.
		return navigation.addListener("beforeRemove", (event) => {
			if (savedRef.current) return;
			event.preventDefault();
			showAlert(
				t("profile.discardTitle", {
					defaultValue: "Abandonner les modifications ?",
				}),
				t("profile.discardMessage", {
					defaultValue: "Ce que vous avez changé ne sera pas enregistré.",
				}),
				[
					{ text: t("common.cancel"), style: "cancel" },
					{
						text: t("create.discardConfirm"),
						style: "destructive",
						onPress: () => navigation.dispatch(event.data.action),
					},
				],
			);
		});
	}, [dirty, navigation, showAlert, t]);

	const c = useGroupedColors();

	const pickAvatar = async (fromCamera: boolean) => {
		try {
			if (fromCamera) {
				const { status } = await ImagePicker.requestCameraPermissionsAsync();
				if (status !== "granted") {
					showError(
						t("profile.cameraPermissionDeniedTitle"),
						t("profile.cameraPermissionDeniedMessage"),
					);
					return;
				}
			} else {
				const { status } =
					await ImagePicker.requestMediaLibraryPermissionsAsync();
				if (status !== "granted") {
					showError(
						t("profile.galleryPermissionDeniedTitle"),
						t("profile.galleryPermissionDeniedMessage"),
					);
					return;
				}
			}
			const result = fromCamera
				? await ImagePicker.launchCameraAsync({
						allowsEditing: true,
						aspect: [1, 1],
						quality: 0.85,
					})
				: await ImagePicker.launchImageLibraryAsync({
						mediaTypes: ["images"],
						allowsEditing: true,
						aspect: [1, 1],
						quality: 0.85,
					});
			if (result.canceled || !result.assets?.[0]) return;
			const asset = result.assets[0];
			setAvatarUploading(true);
			const defaultBaseName = `avatar_${Date.now()}`;
			const formData = await createMediaUploadFormData(asset, {
				defaultBaseName,
				alt: asset.fileName ?? defaultBaseName,
			});
			const uploaded = await api.upload<{ doc: { id: string; url: string } }>(
				"/api/media",
				formData,
			);
			if (!uploaded?.doc?.id) throw new Error("Upload échoué");
			await api.patch(`/api/users/${user?.id}`, { avatar: uploaded.doc.id });
			setAvatarUri(asset.uri);
			await refreshUser();
			showSuccess(
				t("profile.uploadSuccessTitle"),
				t("profile.uploadSuccessMessage"),
			);
		} catch (err) {
			showError(
				t("auth.errorTitle"),
				getErrorMessage(err, t("profile.uploadFailedMessage")),
			);
		} finally {
			setAvatarUploading(false);
		}
	};

	const handlePickAvatar = () => {
		showAlert(t("profile.photoPickerTitle"), t("profile.photoPickerMessage"), [
			{ text: t("profile.takePhoto"), onPress: () => pickAvatar(true) },
			{ text: t("profile.gallery"), onPress: () => pickAvatar(false) },
			{ text: t("common.cancel"), style: "cancel" },
		]);
	};

	const { mutate: save, isPending } = useMutation({
		mutationFn: () =>
			api.patch(`/api/users/${user?.id}`, {
				name: name.trim(),
				bio,
				location,
			}),
		onSuccess: async () => {
			savedRef.current = true;
			await refreshUser();
			showSuccess(
				t("profile.profileUpdatedTitle"),
				t("profile.profileUpdatedMessage"),
			);
			close();
		},
		onError: (err: unknown) =>
			showError(t("auth.errorTitle"), getErrorMessage(err, t("common.error"))),
	});

	// The name is the one required field: an empty one is refused here,
	// under the field, rather than by the server in a sheet.
	const handleSave = () => {
		if (!name.trim()) {
			setNameError(
				t("profile.nameRequired", { defaultValue: "Indiquez votre nom" }),
			);
			return;
		}
		setNameError(null);
		save();
	};

	const fields = [
		{
			label: t("auth.name"),
			value: name,
			set: (text: string) => {
				setName(text);
				if (nameError && text.trim()) setNameError(null);
			},
			placeholder: t("auth.fullNamePlaceholder"),
			keyboard: "default",
			error: nameError,
		},
		{
			label: t("profile.bioLabel"),
			error: null,
			value: bio,
			set: setBio,
			placeholder: t("profile.bioPlaceholderInput"),
			multiline: true,
		},
		{
			label: t("profile.locationLabel"),
			error: null,
			value: location,
			set: setLocation,
			placeholder: t("profile.locationPlaceholder"),
			keyboard: "default",
		},
	];

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.background }]}
		>
			<SettingsHeader
				title={t("profile.editProfileTitle")}
				right={
					<Pressable
						onPress={handleSave}
						disabled={isPending || !dirty}
						accessibilityRole="button"
						accessibilityLabel={t("profile.save")}
						accessibilityState={{
							disabled: isPending || !dirty,
							busy: isPending,
						}}
						hitSlop={12}
						style={styles.saveHit}
					>
						{isPending ? (
							<ActivityIndicator color={c.link} />
						) : (
							<Text
								style={[
									styles.saveBtn,
									{ color: dirty ? c.link : c.mutedForeground },
								]}
							>
								{t("profile.save")}
							</Text>
						)}
					</Pressable>
				}
			/>

			<KeyboardAwareScrollView
				contentContainerStyle={[styles.scroll, centeredContent]}
				keyboardShouldPersistTaps="handled"
				bottomOffset={80}
			>
				{/* Avatar */}
				<View style={styles.avatarSection}>
					<UserAvatar user={user} uri={avatarUri} size={96} />
					<Pressable
						style={({ pressed }) => [
							styles.changeAvatarBtn,
							{
								backgroundColor: c.card,
								borderColor: c.borderStrong,
								opacity: avatarUploading ? 0.6 : pressed ? 0.85 : 1,
							},
						]}
						onPress={handlePickAvatar}
						disabled={avatarUploading}
						hitSlop={4}
						accessibilityRole="button"
						accessibilityLabel={t("profile.editAvatar")}
						accessibilityState={{
							disabled: avatarUploading,
							busy: avatarUploading,
						}}
					>
						{avatarUploading ? (
							<ActivityIndicator size="small" color={c.link} />
						) : (
							<>
								<Ionicons name="camera-outline" size={16} color={c.link} />
								<Text style={[styles.changeAvatarText, { color: c.link }]}>
									{t("profile.change")}
								</Text>
							</>
						)}
					</Pressable>
				</View>

				{/* Shop verification — an owner sees their badge and a way to raise
				    it; a visitor with no shop sees nothing, same as before shops
				    carried badges. */}
				{ownShop ? (
					<GroupedSection>
						<GroupedRow
							label={t("shop.increaseLevel")}
							onPress={() => router.push("/seller/verification" as never)}
							trailing={<LevelBadge badge={ownShop.badge} size="sm" />}
						/>
					</GroupedSection>
				) : null}

				{/* Fields */}
				{fields.map(
					({ label, value, set, placeholder, multiline, keyboard, error }) => (
						<FormField
							key={label}
							label={label}
							error={error}
							value={value}
							onChangeText={set}
							placeholder={placeholder}
							multiline={multiline}
							keyboardType={
								(keyboard as TextInputProps["keyboardType"]) ?? "default"
							}
						/>
					),
				)}

				{/* The number is changed in Security, behind an SMS code: the row
				    says where it stands and goes there. */}
				<GroupedSection
					footer={t("profile.phoneChangeFooter", {
						defaultValue:
							"Pour changer de numéro, il faut le confirmer par SMS.",
					})}
				>
					<GroupedRow
						icon="call-outline"
						label={t("profile.phoneLabel")}
						value={user?.phone ?? null}
						onPress={() => router.push("/security")}
						trailing={
							user?.phoneVerified === undefined ? undefined : (
								<View style={styles.phoneStatus}>
									<Ionicons
										name={
											user.phoneVerified ? "checkmark-circle" : "alert-circle"
										}
										size={15}
										color={user.phoneVerified ? c.successText : c.warningText}
									/>
									<Text
										style={[
											styles.phoneStatusText,
											{
												color: user.phoneVerified
													? c.successText
													: c.warningText,
											},
										]}
									>
										{user.phoneVerified
											? t("settings.phoneVerifiedBadge")
											: t("settings.phoneNotVerifiedBadge")}
									</Text>
								</View>
							)
						}
						accessibilityLabel={[
							t("profile.phoneLabel"),
							user?.phone,
							user?.phoneVerified === undefined
								? null
								: user.phoneVerified
									? t("settings.phoneVerifiedBadge")
									: t("settings.phoneNotVerifiedBadge"),
						]
							.filter(Boolean)
							.join(", ")}
					/>
				</GroupedSection>
			</KeyboardAwareScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	saveHit: { minHeight: 44, justifyContent: "center" },
	saveBtn: { fontSize: 16, fontFamily: Fonts.bodyBold },
	scroll: { padding: 16, paddingTop: 24, gap: 20, paddingBottom: 48 },
	avatarSection: { alignItems: "center", gap: 12 },

	changeAvatarBtn: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		minHeight: 40,
		borderRadius: 12,
		borderWidth: 1,
		paddingHorizontal: 14,
	},
	changeAvatarText: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	phoneStatus: { flexDirection: "row", alignItems: "center", gap: 4 },
	phoneStatusText: { fontSize: 13, fontFamily: Fonts.bodySemibold },
});
