import type { AlertButton, AlertType } from "@/src/components/CustomAlert";

export interface AlertRequest {
	type: AlertType;
	title: string;
	message?: string;
	buttons: AlertButton[];
}

/** Shows one alert; resolves with the button pressed, or null if dismissed. */
export type PresentAlert = (request: AlertRequest) => Promise<number | null>;

export interface ConfirmOptions {
	confirmText?: string;
	cancelText?: string;
	/** For what deletes or cannot be undone: the button reads as such. */
	destructive?: boolean;
}

export interface Alerts {
	showAlert: (
		title: string,
		message?: string,
		buttons?: AlertButton[],
		type?: AlertType,
	) => void;
	showSuccess: (title: string, message?: string) => void;
	showError: (title: string, message?: string) => void;
	showWarning: (title: string, message?: string) => void;
	showConfirm: (
		title: string,
		message: string,
		onConfirm: () => void,
		onCancel?: () => void,
	) => void;
	/** Awaited: true on confirm, false on cancel or dismissal. */
	confirm: (
		title: string,
		message?: string,
		options?: ConfirmOptions,
	) => Promise<boolean>;
	hideAlert: () => void;
}

/**
 * The app's alerts over one awaited sheet (`present`). The callback API stays
 * as it was; `confirm` is the awaited one for new code. A dismissed confirm
 * counts as a cancel, so `onCancel` runs for it too.
 */
export function createAlerts(
	present: PresentAlert,
	hide: () => void,
	t: (key: string) => string,
): Alerts {
	const run = async (request: AlertRequest) => {
		const index = await present(request);
		if (index !== null) request.buttons[index]?.onPress?.();
	};
	const showAlert: Alerts["showAlert"] = (
		title,
		message,
		buttons,
		type = "info",
	) => {
		void run({
			type,
			title,
			message,
			buttons: buttons?.length ? buttons : [{ text: t("common.ok") }],
		});
	};
	const confirm: Alerts["confirm"] = async (title, message, options = {}) => {
		const index = await present({
			type: "confirm",
			title,
			message,
			buttons: [
				{ text: options.cancelText ?? t("common.cancel"), style: "cancel" },
				{
					text: options.confirmText ?? t("common.confirm"),
					style: options.destructive ? "destructive" : "default",
				},
			],
		});
		return index === 1;
	};

	return {
		showAlert,
		showSuccess: (title, message) =>
			showAlert(title, message, undefined, "success"),
		showError: (title, message) =>
			showAlert(title, message, undefined, "error"),
		showWarning: (title, message) =>
			showAlert(title, message, undefined, "warning"),
		showConfirm: (title, message, onConfirm, onCancel) => {
			void confirm(title, message).then((ok) =>
				ok ? onConfirm() : onCancel?.(),
			);
		},
		confirm,
		hideAlert: hide,
	};
}
