import { useMutation } from "@tanstack/react-query";
import { api } from "@/src/lib/api";

/**
 * Sends the verification email again. The API answers the same whether or
 * not the address has an account, so success only means "sent if there was
 * something to send".
 */
export function useResendVerification() {
	return useMutation({
		mutationFn: (email: string) =>
			api.post("/api/account/email/resend", { email }),
	});
}
