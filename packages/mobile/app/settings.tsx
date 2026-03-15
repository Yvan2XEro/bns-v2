import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";
import Constants from "expo-constants";
import { router } from "expo-router";
import type React from "react";
import { useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAlert } from "@/src/contexts/AlertContext";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";

export default function SettingsScreen() {
	const isDark = useColorScheme() === "dark";
	const { user, logout } = useAuth();
	const { showSuccess, showError, showConfirm } = useAlert();
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [_currentPwd, setCurrentPwd] = useState("");
	const [newEmail, setNewEmail] = useState("");
	const [_pwdForEmail, setPwdForEmail] = useState("");

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";

	const { mutate: changePassword, isPending: pwdLoading } = useMutation({
		mutationFn: async () => {
			if (newPassword !== confirmPassword)
				throw new Error("Les mots de passe ne correspondent pas");
			if (newPassword.length < 8) throw new Error("Min. 8 caractères");
			return api.patch(`/api/users/${user?.id}`, { password: newPassword });
		},
		onSuccess: () => {
			showSuccess(
				"Mot de passe modifié",
				"Votre mot de passe a été mis à jour.",
			);
			setNewPassword("");
			setConfirmPassword("");
			setCurrentPwd("");
		},
		onError: (err: any) => showError("Erreur", err.message),
	});

	const { mutate: changeEmail, isPending: emailLoading } = useMutation({
		mutationFn: () => api.patch(`/api/users/${user?.id}`, { email: newEmail }),
		onSuccess: () => {
			showSuccess("Email modifié", "Votre adresse email a été mise à jour.");
			setNewEmail("");
			setPwdForEmail("");
		},
		onError: (err: any) => showError("Erreur", err.message),
	});

	const handleDeleteAccount = () => {
		showConfirm(
			"Supprimer le compte",
			"Cette action est irréversible. Toutes vos données seront supprimées.",
			async () => {
				try {
					await api.delete(`/api/users/${user?.id}`);
					await logout();
					router.replace("/(tabs)/home");
				} catch (err: any) {
					showError("Erreur", err.message);
				}
			},
		);
	};

	const version = Constants.expoConfig?.version ?? "1.0.0";

	const Section = ({
		title,
		children,
	}: {
		title: string;
		children: React.ReactNode;
	}) => (
		<View style={[styles.section, { backgroundColor: cardBg, borderColor }]}>
			<Text style={[styles.sectionTitle, { color: mutedColor }]}>{title}</Text>
			{children}
		</View>
	);

	const Field = ({ label, value, onChange, placeholder, secure }: any) => (
		<View style={styles.fieldGroup}>
			<Text style={[styles.fieldLabel, { color: mutedColor }]}>{label}</Text>
			<TextInput
				value={value}
				onChangeText={onChange}
				placeholder={placeholder}
				placeholderTextColor={mutedColor}
				style={[
					styles.field,
					{
						backgroundColor: isDark ? "#0b1120" : "#f8fafc",
						borderColor,
						color: textColor,
					},
				]}
				secureTextEntry={secure}
			/>
		</View>
	);

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
					Paramètres
				</Text>
				<View style={{ width: 40 }} />
			</View>

			<ScrollView contentContainerStyle={styles.scroll}>
				<Section title="CHANGER LE MOT DE PASSE">
					<Field
						label="Nouveau mot de passe"
						value={newPassword}
						onChange={setNewPassword}
						placeholder="Min. 8 caractères"
						secure
					/>
					<Field
						label="Confirmer"
						value={confirmPassword}
						onChange={setConfirmPassword}
						placeholder="Répétez"
						secure
					/>
					<Pressable
						onPress={() => changePassword()}
						disabled={pwdLoading}
						style={[styles.btn, { backgroundColor: primaryColor }]}
					>
						{pwdLoading ? (
							<ActivityIndicator color="#fff" />
						) : (
							<Text style={styles.btnText}>Modifier le mot de passe</Text>
						)}
					</Pressable>
				</Section>

				<Section title="CHANGER L'EMAIL">
					<Field
						label="Nouvel email"
						value={newEmail}
						onChange={setNewEmail}
						placeholder="nouveau@email.com"
					/>
					<Pressable
						onPress={() => changeEmail()}
						disabled={emailLoading}
						style={[styles.btn, { backgroundColor: primaryColor }]}
					>
						{emailLoading ? (
							<ActivityIndicator color="#fff" />
						) : (
							<Text style={styles.btnText}>Modifier l'email</Text>
						)}
					</Pressable>
				</Section>

				<Section title="INFORMATIONS">
					<View style={styles.infoRow}>
						<Text style={[styles.infoLabel, { color: mutedColor }]}>
							Version
						</Text>
						<Text style={[styles.infoVal, { color: textColor }]}>
							{version}
						</Text>
					</View>
				</Section>

				<View
					style={[
						styles.section,
						{
							backgroundColor: isDark ? "#1a0a0a" : "#fff5f5",
							borderColor: "#dc2626",
						},
					]}
				>
					<Text style={[styles.sectionTitle, { color: "#dc2626" }]}>
						ZONE DANGEREUSE
					</Text>
					<Pressable onPress={handleDeleteAccount} style={[styles.deleteBtn]}>
						<Ionicons name="trash" size={16} color="#dc2626" />
						<Text style={styles.deleteText}>Supprimer mon compte</Text>
					</Pressable>
				</View>
			</ScrollView>
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
	headerTitle: {
		flex: 1,
		fontSize: 18,
		fontWeight: "700",
		textAlign: "center",
	},
	scroll: { padding: 16, gap: 12, paddingBottom: 40 },
	section: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 12 },
	sectionTitle: {
		fontSize: 11,
		fontWeight: "700",
		letterSpacing: 0.5,
		marginBottom: 4,
	},
	fieldGroup: { gap: 6 },
	fieldLabel: { fontSize: 13, fontWeight: "600" },
	field: {
		borderRadius: 10,
		borderWidth: 1.5,
		paddingHorizontal: 12,
		paddingVertical: 11,
		fontSize: 15,
	},
	btn: { borderRadius: 10, paddingVertical: 12, alignItems: "center" },
	btnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
	infoRow: { flexDirection: "row", justifyContent: "space-between" },
	infoLabel: { fontSize: 14 },
	infoVal: { fontSize: 14, fontWeight: "600" },
	deleteBtn: { flexDirection: "row", alignItems: "center", gap: 8 },
	deleteText: { color: "#dc2626", fontSize: 14, fontWeight: "600" },
});
