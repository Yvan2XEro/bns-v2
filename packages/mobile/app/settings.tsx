import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { router } from "expo-router";
import * as Updates from "expo-updates";
import { useState } from "react";
import {
	ActivityIndicator,
	Appearance,
	Modal,
	Pressable,
	ScrollView,
	StyleSheet,
	Switch,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useResponsive } from "@/src/hooks/useResponsive";
import i18n, { useTranslation } from "@/src/lib/i18n";

export const LANG_STORAGE_KEY = "app_language";
export const THEME_STORAGE_KEY = "app_theme";

type Locale = "fr" | "en";

const LANGUAGES: { code: Locale; label: string; flag: string }[] = [
	{ code: "fr", label: "Français", flag: "🇫🇷" },
	{ code: "en", label: "English", flag: "🇬🇧" },
];

interface SectionProps {
	title: string;
	icon: keyof typeof Ionicons.glyphMap;
	children: React.ReactNode;
	cardBg: string;
	borderColor: string;
	textColor: string;
	isDark: boolean;
}

function Section({
	title,
	icon,
	children,
	cardBg,
	borderColor,
	textColor,
	isDark,
}: SectionProps) {
	return (
		<View style={[styles.section, { backgroundColor: cardBg, borderColor }]}>
			<View style={styles.sectionHeader}>
				<View
					style={[
						styles.sectionIconBox,
						{ backgroundColor: isDark ? "#1e293b" : "#f1f5f9" },
					]}
				>
					<Ionicons
						name={icon}
						size={15}
						color={isDark ? "#94a3b8" : "#475569"}
					/>
				</View>
				<Text style={[styles.sectionTitle, { color: textColor }]}>{title}</Text>
			</View>
			<View style={styles.sectionBody}>{children}</View>
		</View>
	);
}

export default function SettingsScreen() {
	const colorScheme = useColorScheme();
	const { centeredContent } = useResponsive();
	const [isDark, setIsDark] = useState(colorScheme === "dark");
	const { t } = useTranslation();
	const [langPickerOpen, setLangPickerOpen] = useState(false);
	const [updateChecked, setUpdateChecked] = useState(false);
	const [checkError, setCheckError] = useState(false);

	const { isChecking, isDownloading, isUpdateAvailable, isUpdatePending } =
		Updates.useUpdates();

	const handleCheckUpdate = async () => {
		setCheckError(false);
		try {
			await Updates.checkForUpdateAsync();
			setUpdateChecked(true);
		} catch {
			setUpdateChecked(true);
			setCheckError(true);
		}
	};

	const handleDownloadUpdate = async () => {
		try {
			await Updates.fetchUpdateAsync();
		} catch {
			// download error surfaced via useUpdates().downloadError
		}
	};

	const handleRestart = async () => {
		await Updates.reloadAsync();
	};

	const currentLang =
		(i18n.language?.slice(0, 2) as Locale | undefined) ?? "fr";
	const version = Constants.expoConfig?.version ?? "1.0.0";

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";
	const inputBg = isDark ? "#0b1120" : "#f8fafc";

	const sectionColors = { cardBg, borderColor, textColor, isDark };

	const changeLanguage = async (locale: Locale) => {
		await i18n.changeLanguage(locale);
		await AsyncStorage.setItem(LANG_STORAGE_KEY, locale);
		setLangPickerOpen(false);
	};

	const toggleDarkMode = (value: boolean) => {
		setIsDark(value); // update immediately — don't wait for Appearance event
		const scheme = value ? "dark" : "light";
		Appearance.setColorScheme(scheme);
		AsyncStorage.setItem(THEME_STORAGE_KEY, scheme);
	};

	const currentLangLabel =
		LANGUAGES.find((l) => l.code === currentLang)?.label ?? "Français";

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: bg }]}
		>
			<View style={[styles.header, { borderBottomColor: borderColor }]}>
				<Pressable onPress={() => router.back()} style={styles.backBtn}>
					<Ionicons name="arrow-back" size={22} color={textColor} />
				</Pressable>
				<Text style={[styles.headerTitle, { color: textColor }]}>
					{t("settings.title")}
				</Text>
				<View style={{ width: 40 }} />
			</View>

			<ScrollView
				contentContainerStyle={[
					styles.scroll,
					{ backgroundColor: bg },
					centeredContent,
				]}
				showsVerticalScrollIndicator={false}
			>
				{/* Language */}
				<Section
					title={t("settings.language")}
					icon="globe-outline"
					{...sectionColors}
				>
					<Pressable
						onPress={() => setLangPickerOpen(true)}
						style={[
							styles.selectRow,
							{ backgroundColor: inputBg, borderColor },
						]}
					>
						<Ionicons
							name="language-outline"
							size={17}
							color={mutedColor}
							style={{ marginRight: 10 }}
						/>
						<Text style={[styles.selectValue, { color: textColor }]}>
							{currentLangLabel}
						</Text>
						<Ionicons name="chevron-down" size={16} color={mutedColor} />
					</Pressable>
				</Section>

				{/* Appearance */}
				<Section
					title={t("settings.theme")}
					icon="moon-outline"
					{...sectionColors}
				>
					<View style={[styles.switchRow, { borderColor }]}>
						<Ionicons
							name={isDark ? "moon" : "sunny-outline"}
							size={17}
							color={isDark ? "#94a3b8" : "#475569"}
							style={{ marginRight: 10 }}
						/>
						<Text style={[styles.switchLabel, { color: textColor, flex: 1 }]}>
							{t("settings.themeDark")}
						</Text>
						<Switch
							value={isDark}
							onValueChange={toggleDarkMode}
							trackColor={{ false: "#CBD5E1", true: primaryColor }}
							thumbColor="#fff"
							ios_backgroundColor="#CBD5E1"
						/>
					</View>
				</Section>

				{/* Updates */}
				<Section
					title={t("settings.updatesSection")}
					icon="cloud-download-outline"
					{...sectionColors}
				>
					<View style={[styles.updateRow, { borderColor }]}>
						{/* Status line */}
						<View style={styles.updateStatus}>
							{isChecking || isDownloading ? (
								<>
									<ActivityIndicator
										size="small"
										color={primaryColor}
										style={{ marginRight: 8 }}
									/>
									<Text
										style={[styles.updateStatusText, { color: mutedColor }]}
									>
										{isDownloading
											? t("settings.downloading")
											: t("settings.checking")}
									</Text>
								</>
							) : isUpdatePending ? (
								<>
									<Ionicons
										name="checkmark-circle"
										size={17}
										color="#22c55e"
										style={{ marginRight: 6 }}
									/>
									<Text style={[styles.updateStatusText, { color: "#22c55e" }]}>
										{t("settings.readyToInstall")}
									</Text>
								</>
							) : updateChecked && isUpdateAvailable ? (
								<>
									<Ionicons
										name="arrow-up-circle-outline"
										size={17}
										color={primaryColor}
										style={{ marginRight: 6 }}
									/>
									<Text
										style={[styles.updateStatusText, { color: primaryColor }]}
									>
										{t("settings.updateAvailable")}
									</Text>
								</>
							) : updateChecked && !checkError ? (
								<>
									<Ionicons
										name="checkmark-circle-outline"
										size={17}
										color="#22c55e"
										style={{ marginRight: 6 }}
									/>
									<Text style={[styles.updateStatusText, { color: "#22c55e" }]}>
										{t("settings.upToDate")}
									</Text>
								</>
							) : checkError ? (
								<>
									<Ionicons
										name="alert-circle-outline"
										size={17}
										color="#ef4444"
										style={{ marginRight: 6 }}
									/>
									<Text style={[styles.updateStatusText, { color: "#ef4444" }]}>
										{t("settings.checkFailed")}
									</Text>
								</>
							) : (
								<Text style={[styles.updateStatusText, { color: mutedColor }]}>
									v{version}
								</Text>
							)}
						</View>

						{/* Action button */}
						{isUpdatePending ? (
							<Pressable
								onPress={handleRestart}
								style={[styles.updateBtn, { backgroundColor: "#22c55e" }]}
							>
								<Text style={styles.updateBtnText}>
									{t("settings.restartNow")}
								</Text>
							</Pressable>
						) : isUpdateAvailable ? (
							<Pressable
								onPress={handleDownloadUpdate}
								disabled={isDownloading}
								style={[
									styles.updateBtn,
									{
										backgroundColor: primaryColor,
										opacity: isDownloading ? 0.6 : 1,
									},
								]}
							>
								<Text style={styles.updateBtnText}>
									{t("settings.download")}
								</Text>
							</Pressable>
						) : (
							<Pressable
								onPress={handleCheckUpdate}
								disabled={isChecking}
								style={[
									styles.updateBtn,
									{
										backgroundColor: isDark ? "#1e3a5f" : "#e2e8f0",
										opacity: isChecking ? 0.6 : 1,
									},
								]}
							>
								<Text
									style={[
										styles.updateBtnText,
										{ color: isDark ? "#93c5fd" : "#475569" },
									]}
								>
									{t("settings.checkForUpdates")}
								</Text>
							</Pressable>
						)}
					</View>
				</Section>

				{/* App version */}
				<Section
					title={t("settings.aboutSection")}
					icon="information-circle-outline"
					{...sectionColors}
				>
					<View style={[styles.infoRow, { borderColor }]}>
						<Text style={[styles.infoLabel, { color: mutedColor }]}>
							{t("settings.appVersion")}
						</Text>
						<View
							style={[
								styles.versionBadge,
								{ backgroundColor: isDark ? "#1e293b" : "#f1f5f9" },
							]}
						>
							<Text style={[styles.versionText, { color: primaryColor }]}>
								v{version}
							</Text>
						</View>
					</View>
				</Section>
			</ScrollView>

			{/* Language picker modal */}
			<Modal
				visible={langPickerOpen}
				transparent
				animationType="slide"
				onRequestClose={() => setLangPickerOpen(false)}
			>
				<Pressable
					style={styles.modalOverlay}
					onPress={() => setLangPickerOpen(false)}
				/>
				<View style={[styles.modalSheet, { backgroundColor: cardBg }]}>
					<View
						style={[styles.modalHandle, { backgroundColor: borderColor }]}
					/>
					<Text style={[styles.modalTitle, { color: textColor }]}>
						{t("settings.language")}
					</Text>
					{LANGUAGES.map((lang, i) => (
						<Pressable
							key={lang.code}
							onPress={() => changeLanguage(lang.code)}
							style={[
								styles.langOption,
								{
									borderBottomColor:
										i < LANGUAGES.length - 1 ? borderColor : "transparent",
								},
							]}
						>
							<Text style={styles.langFlag}>{lang.flag}</Text>
							<Text style={[styles.langLabel, { color: textColor, flex: 1 }]}>
								{lang.label}
							</Text>
							<View
								style={[
									styles.radioOuter,
									{
										borderColor:
											currentLang === lang.code ? primaryColor : mutedColor,
									},
								]}
							>
								{currentLang === lang.code && (
									<View
										style={[
											styles.radioInner,
											{ backgroundColor: primaryColor },
										]}
									/>
								)}
							</View>
						</Pressable>
					))}
					<View style={{ height: 24 }} />
				</View>
			</Modal>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	header: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 16,
		paddingVertical: 14,
		borderBottomWidth: 1,
	},
	backBtn: {
		width: 40,
		height: 40,
		alignItems: "center",
		justifyContent: "center",
	},
	headerTitle: {
		flex: 1,
		fontSize: 20,
		fontFamily: Fonts.displayBold,
		textAlign: "center",
	},
	scroll: { padding: 16, gap: 12, paddingBottom: 48 },
	section: {
		borderRadius: 16,
		borderWidth: 1,
		overflow: "hidden",
	},
	sectionHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingHorizontal: 16,
		paddingTop: 14,
		paddingBottom: 12,
	},
	sectionIconBox: {
		width: 30,
		height: 30,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
	},
	sectionTitle: {
		fontSize: 15,
		fontFamily: Fonts.displayBold,
	},
	sectionBody: {
		paddingHorizontal: 16,
		paddingBottom: 16,
		gap: 12,
	},
	selectRow: {
		flexDirection: "row",
		alignItems: "center",
		borderRadius: 10,
		borderWidth: 1.5,
		paddingHorizontal: 12,
		paddingVertical: 13,
	},
	selectValue: {
		flex: 1,
		fontSize: 15,
		fontFamily: Fonts.body,
	},
	switchRow: {
		flexDirection: "row",
		alignItems: "center",
		borderWidth: 1,
		borderRadius: 10,
		paddingHorizontal: 12,
		paddingVertical: 11,
	},
	switchLabel: {
		fontSize: 15,
		fontFamily: Fonts.body,
	},
	infoRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		borderWidth: 1,
		borderRadius: 10,
		paddingHorizontal: 12,
		paddingVertical: 11,
	},
	updateRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		borderWidth: 1,
		borderRadius: 10,
		paddingHorizontal: 12,
		paddingVertical: 10,
		gap: 10,
	},
	updateStatus: {
		flexDirection: "row",
		alignItems: "center",
		flex: 1,
	},
	updateStatusText: {
		fontSize: 13,
		fontFamily: Fonts.body,
	},
	updateBtn: {
		borderRadius: 8,
		paddingHorizontal: 12,
		paddingVertical: 7,
	},
	updateBtnText: {
		fontSize: 13,
		fontFamily: Fonts.displayBold,
		color: "#ffffff",
	},
	infoLabel: {
		fontSize: 14,
		fontFamily: Fonts.body,
	},
	versionBadge: {
		borderRadius: 8,
		paddingHorizontal: 10,
		paddingVertical: 4,
	},
	versionText: {
		fontSize: 13,
		fontFamily: Fonts.displayBold,
	},
	/* Modal */
	modalOverlay: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.4)",
	},
	modalSheet: {
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		paddingHorizontal: 20,
		paddingTop: 12,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: -4 },
		shadowOpacity: 0.12,
		shadowRadius: 12,
		elevation: 16,
	},
	modalHandle: {
		width: 36,
		height: 4,
		borderRadius: 2,
		alignSelf: "center",
		marginBottom: 16,
	},
	modalTitle: {
		fontSize: 17,
		fontFamily: Fonts.displayBold,
		marginBottom: 12,
	},
	langOption: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 16,
		borderBottomWidth: 1,
		gap: 14,
	},
	langFlag: {
		fontSize: 22,
	},
	langLabel: {
		fontSize: 16,
		fontFamily: Fonts.body,
	},
	radioOuter: {
		width: 20,
		height: 20,
		borderRadius: 10,
		borderWidth: 2,
		alignItems: "center",
		justifyContent: "center",
	},
	radioInner: {
		width: 10,
		height: 10,
		borderRadius: 5,
	},
});
