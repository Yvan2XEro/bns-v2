import { useRef, useState } from "react";
import { createCallable } from "react-call";
import CustomAlert, { ALERT_EXIT_DELAY } from "@/src/components/CustomAlert";
import type { AlertRequest } from "@/src/lib/alerts";

/**
 * The alert sheet, awaited: `await AlertSheet.call({...})` resolves with the
 * index of the button pressed, or null when the sheet is dismissed (backdrop,
 * Android back). It resolves once the sheet has left the screen, so what the
 * caller does next — often another alert — starts from a closed Modal.
 *
 * Alerts asked for while one shows wait their turn instead of replacing it:
 * two React Native Modals presented together fail on iOS, and a replaced
 * alert lost its buttons' callbacks. Mounted once, by `AlertProvider`.
 */
export const AlertSheet = createCallable<AlertRequest, number | null>(
	({ call, type, title, message, buttons }) => {
		const [visible, setVisible] = useState(true);
		const settled = useRef(false);
		const settle = (index: number | null) => {
			if (settled.current) return;
			settled.current = true;
			call.end(index);
		};

		if (call.index > 0) return null;

		return (
			<CustomAlert
				visible={visible}
				type={type}
				title={title}
				message={message}
				// CustomAlert closes first and runs the button once the sheet is
				// gone; a dismissal only closes, so it settles a little later.
				buttons={buttons.map((button, index) => ({
					...button,
					onPress: () => settle(index),
				}))}
				onClose={() => {
					setVisible(false);
					setTimeout(() => settle(null), ALERT_EXIT_DELAY + 100);
				}}
			/>
		);
	},
);
