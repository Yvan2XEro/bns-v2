import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";
import CustomAlert, {
	type AlertButton,
	type AlertType,
} from "@/src/components/CustomAlert";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AlertState {
	visible: boolean;
	type: AlertType;
	title: string;
	message?: string;
	buttons: AlertButton[];
}

interface AlertContextType {
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
	hideAlert: () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export function AlertProvider({ children }: { children: ReactNode }) {
	const [state, setState] = useState<AlertState>({
		visible: false,
		type: "info",
		title: "",
		message: undefined,
		buttons: [{ text: "OK" }],
	});

	const showAlert = useCallback(
		(
			title: string,
			message?: string,
			buttons?: AlertButton[],
			type: AlertType = "info",
		) => {
			setState({
				visible: true,
				type,
				title,
				message,
				buttons: buttons ?? [{ text: "OK" }],
			});
		},
		[],
	);

	const hideAlert = useCallback(
		() => setState((p) => ({ ...p, visible: false })),
		[],
	);

	const showSuccess = useCallback(
		(t: string, m?: string) => showAlert(t, m, undefined, "success"),
		[showAlert],
	);
	const showError = useCallback(
		(t: string, m?: string) => showAlert(t, m, undefined, "error"),
		[showAlert],
	);
	const showWarning = useCallback(
		(t: string, m?: string) => showAlert(t, m, undefined, "warning"),
		[showAlert],
	);

	const showConfirm = useCallback(
		(
			title: string,
			message: string,
			onConfirm: () => void,
			onCancel?: () => void,
		) => {
			showAlert(
				title,
				message,
				[
					{ text: "Annuler", style: "cancel", onPress: onCancel },
					{ text: "Confirmer", style: "default", onPress: onConfirm },
				],
				"confirm",
			);
		},
		[showAlert],
	);

	const value = useMemo(
		() => ({
			showAlert,
			showSuccess,
			showError,
			showWarning,
			showConfirm,
			hideAlert,
		}),
		[showAlert, showSuccess, showError, showWarning, showConfirm, hideAlert],
	);

	return (
		<AlertContext.Provider value={value}>
			{children}
			<CustomAlert
				visible={state.visible}
				type={state.type}
				title={state.title}
				message={state.message}
				buttons={state.buttons}
				onClose={hideAlert}
			/>
		</AlertContext.Provider>
	);
}

export function useAlert() {
	const ctx = useContext(AlertContext);
	if (!ctx) throw new Error("useAlert must be used within AlertProvider");
	return ctx;
}
