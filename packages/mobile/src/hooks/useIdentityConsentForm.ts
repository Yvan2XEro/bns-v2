import { zodResolver } from "@hookform/resolvers/zod";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useReducer, useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useMyShop } from "@/src/hooks/useShops";
import {
	useOpenVerificationRequest,
	useShopVerification,
	useStartKycSession,
} from "@/src/hooks/useVerification";
import { ApiError } from "@/src/lib/api";
import { ERROR_CODES, resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import { canOpenRequest } from "@/src/lib/verification";

/**
 * The vendor never sees this session start until the checkbox has been
 * ticked and Start pressed — `startKycSession` is the only call this flow
 * makes that leaves our server, and it always carries the consent version
 * the seller just agreed to.
 */
const consentSchema = z.object({
	// A literal(true) requirement with a boolean-typed, unchecked-by-default
	// field: `refine` keeps the field typed as `boolean` (so
	// `defaultValues: { accepted: false }` type-checks) while still refusing
	// submission until it is `true`.
	accepted: z.boolean().refine((value) => value === true, {
		message: "verification.identity.consent.checkboxError",
	}),
});
export type ConsentFormValues = z.infer<typeof consentSchema>;

export const RETURN_DEEP_LINK = "buynsellem://seller/verification/return";

interface StartState {
	/** Filled once from an existing draft or a freshly opened one; never reset. */
	requestId: string | undefined;
	phase: "idle" | "starting";
	errorMessage: string | null;
}

const initialState: StartState = {
	requestId: undefined,
	phase: "idle",
	errorMessage: null,
};

function reducer(state: StartState, patch: Partial<StartState>): StartState {
	return { ...state, ...patch };
}

/**
 * Owns the identity-consent screen's data and submission: opening (or
 * resuming) the draft, the consent checkbox form, and starting the vendor
 * session. Split out of the screen so the screen stays render logic.
 */
export function useIdentityConsentForm() {
	const { t, i18n } = useTranslation();
	const myShop = useMyShop();
	const shop = myShop.data?.shop;
	const query = useShopVerification(shop?.id);
	const openRequest = useOpenVerificationRequest(shop?.id);
	const [state, patch] = useReducer(reducer, initialState);
	const startSession = useStartKycSession(state.requestId);

	const level2 = query.data?.requests.level2 ?? null;
	const resumable =
		level2?.status === "draft" || level2?.status === "needs_info";
	const gate = query.data ? canOpenRequest(query.data, 2) : null;
	const canProceed = resumable || Boolean(gate?.ok);

	// Opens (or resumes) the draft as soon as the screen has what it needs —
	// never from the Start button itself, since `useStartKycSession` needs a
	// request id it can only get from this call, and must already be bound
	// to the right one by the time the seller taps Start. A draft carries no
	// personal data: nothing about the seller reaches the vendor until
	// `startKycSession` runs, after consent.
	const openedRef = useRef(false);
	useEffect(() => {
		if (openedRef.current || !shop?.id || !query.data || !canProceed) return;
		if (resumable && level2) {
			openedRef.current = true;
			patch({ requestId: level2.id });
			return;
		}
		if (gate?.ok) {
			openedRef.current = true;
			openRequest.mutate(2, {
				onSuccess: (request) => patch({ requestId: request.id }),
				onError: () => {
					openedRef.current = false;
				},
			});
		}
	}, [
		shop?.id,
		query.data,
		canProceed,
		resumable,
		level2,
		gate?.ok,
		openRequest,
	]);

	const form = useForm<ConsentFormValues>({
		resolver: zodResolver(consentSchema),
		defaultValues: { accepted: false },
	});
	const checkboxErrorKey = form.formState.errors.accepted?.message;
	const checkboxError = checkboxErrorKey
		? t(checkboxErrorKey)
		: (state.errorMessage ?? null);

	const onStart = form.handleSubmit(async () => {
		if (
			!state.requestId ||
			!query.data?.consentVersion ||
			state.phase === "starting"
		) {
			return;
		}
		patch({ phase: "starting", errorMessage: null });
		try {
			const session = await startSession.mutateAsync({
				consentVersion: query.data.consentVersion,
				locale: i18n.language?.startsWith("en") ? "en" : "fr",
			});
			await WebBrowser.openAuthSessionAsync(session.url, RETURN_DEEP_LINK);
		} catch (error) {
			if (
				error instanceof ApiError &&
				error.code === ERROR_CODES.verificationConsentRequired
			) {
				form.reset({ accepted: false });
				patch({ phase: "idle", errorMessage: resolveErrorMessage(error, t) });
				void query.refetch();
				return;
			}
			patch({ phase: "idle", errorMessage: resolveErrorMessage(error, t) });
			return;
		}
		// The vendor's own webhook — not this browser session's outcome — is
		// the authority from here on. The return screen polls for it, whatever
		// the auth session itself resolved with (success, cancel or dismiss).
		const requestId = state.requestId;
		patch({ phase: "idle" });
		router.replace({
			pathname: "/seller/verification/return" as never,
			params: { request: requestId },
		});
	});

	const isLoading = myShop.isPending || (Boolean(shop?.id) && query.isPending);
	const isError = myShop.isError || (Boolean(shop?.id) && query.isError);
	const startDisabled =
		!state.requestId ||
		!query.data?.enabled ||
		!query.data?.consentVersion ||
		state.phase === "starting" ||
		openRequest.isPending;

	return {
		myShop,
		shop,
		query,
		canProceed,
		isLoading,
		isError,
		form,
		checkboxError,
		onStart,
		startDisabled,
		isStarting: state.phase === "starting" || openRequest.isPending,
		requestId: state.requestId,
	};
}
