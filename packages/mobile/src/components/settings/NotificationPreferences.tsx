import { usePreferences } from "@novu/react-native";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useAlert } from "@/src/contexts/AlertContext";
import { useTranslation } from "@/src/lib/i18n";
import { GroupedSection, GroupedSwitchRow, useGroupedColors } from "./Grouped";

/**
 * Which kinds of notification arrive, one switch per workflow the server
 * sends (orders, messages, search alerts, tips…). Each switch turns that
 * kind's push off without touching the others, so a shop on metered data can
 * keep order alerts and drop promotions. Critical workflows (payments,
 * security) are left out: they cannot be turned off. The system permission,
 * which silences everything, stays in the permissions list below.
 *
 * Calls a Novu hook: render it only inside the provider (useNotificationReady).
 */
export function NotificationPreferences() {
	const c = useGroupedColors();
	const { t } = useTranslation();
	const { showError } = useAlert();
	const { preferences, isLoading } = usePreferences();
	// The switch moves at once; the server's answer confirms or reverts it.
	const [pending, setPending] = useState<Record<string, boolean>>({});

	const rows = (preferences ?? []).filter(
		(preference) => preference.workflow && !preference.workflow.critical,
	);

	if (!isLoading && rows.length === 0) return null;

	return (
		<GroupedSection
			title={t("settings.notificationsTitle")}
			footer={t("settings.notificationTypesFooter", {
				defaultValue:
					"Choisissez ce qui vous est envoyé. Pour tout couper, utilisez l'autorisation Notifications plus bas.",
			})}
		>
			{isLoading ? (
				<View style={styles.loading}>
					<ActivityIndicator color={c.link} />
				</View>
			) : (
				rows.map((preference) => {
					const workflow = preference.workflow;
					if (!workflow) return null;
					const id = workflow.id;
					// Push is what reaches the phone; a workflow without a push
					// step is switched on its in-app channel instead.
					const channel =
						preference.channels.push === undefined ? "in_app" : "push";
					const on =
						pending[id] ?? preference.channels[channel] ?? preference.enabled;
					return (
						<GroupedSwitchRow
							key={id}
							label={workflow.name}
							value={on}
							onValueChange={(next) => {
								setPending((map) => ({ ...map, [id]: next }));
								void preference
									.update({
										channels:
											channel === "push" ? { push: next } : { in_app: next },
									})
									.then((result) => {
										setPending(({ [id]: _done, ...rest }) => rest);
										if (result.error) {
											showError(
												t("common.error"),
												t("settings.notificationTypeError", {
													defaultValue:
														"Ce réglage n'a pas été enregistré. Vérifiez votre connexion et réessayez.",
												}),
											);
										}
									});
							}}
						/>
					);
				})
			)}
		</GroupedSection>
	);
}

const styles = StyleSheet.create({
	loading: { paddingVertical: 18, alignItems: "center" },
});
