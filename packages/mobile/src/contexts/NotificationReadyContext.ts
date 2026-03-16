import { createContext, useContext } from "react";

export const NotificationReadyContext = createContext(false);

export function useNotificationReady() {
	return useContext(NotificationReadyContext);
}
