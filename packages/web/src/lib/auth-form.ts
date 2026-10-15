import type { SocialAuthProvider } from "~/hooks/use-auth";

/** Keys under the `Auth` namespace. */
export type AuthIssue =
	| "nameRequired"
	| "emailRequired"
	| "emailInvalid"
	| "passwordRequired"
	| "passwordMinLength"
	| "confirmRequired"
	| "passwordsDoNotMatch";

export type Issues<F extends string> = Partial<Record<F, AuthIssue>>;

export const PASSWORD_MIN_LENGTH = 8;

// Payload's own email validator (payload/dist/fields/validations.js): an
// address that passes here is one the API accepts.
const EMAIL =
	/^(?!.*\.\.)[\w!#$%&'*+/=?^`{|}~-](?:[\w!#$%&'*+/=?^`{|}~.-]*[\w!#$%&'*+/=?^`{|}~-])?@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i;

export function emailIssue(email: string): AuthIssue | undefined {
	const value = email.trim();
	if (!value) return "emailRequired";
	if (!EMAIL.test(value)) return "emailInvalid";
	return undefined;
}

function newPasswordIssues(password: string, confirmPassword: string) {
	const issues: Issues<"password" | "confirmPassword"> = {};
	if (!password) issues.password = "passwordRequired";
	else if (password.length < PASSWORD_MIN_LENGTH)
		issues.password = "passwordMinLength";
	if (!confirmPassword) issues.confirmPassword = "confirmRequired";
	else if (confirmPassword !== password)
		issues.confirmPassword = "passwordsDoNotMatch";
	return issues;
}

const compact = <F extends string>(issues: Issues<F>): Issues<F> =>
	Object.fromEntries(
		Object.entries(issues).filter(([, issue]) => issue !== undefined),
	) as Issues<F>;

export type LoginValues = { email: string; password: string };
export function loginIssues(v: LoginValues): Issues<keyof LoginValues> {
	return compact({
		email: emailIssue(v.email),
		password: v.password ? undefined : "passwordRequired",
	});
}

export type RegisterValues = {
	name: string;
	email: string;
	password: string;
	confirmPassword: string;
};
export function registerIssues(
	v: RegisterValues,
): Issues<keyof RegisterValues> {
	return compact({
		name: v.name.trim() ? undefined : "nameRequired",
		email: emailIssue(v.email),
		...newPasswordIssues(v.password, v.confirmPassword),
	});
}

export type ForgotValues = { email: string };
export function forgotIssues(v: ForgotValues): Issues<keyof ForgotValues> {
	return compact({ email: emailIssue(v.email) });
}

export type ResetValues = { password: string; confirmPassword: string };
export function resetIssues(v: ResetValues): Issues<keyof ResetValues> {
	return compact(newPasswordIssues(v.password, v.confirmPassword));
}

/**
 * What the form shows: a field's issue appears once the field was left with a
 * value in it, or once a submit was tried, and from then on follows the
 * current value — fixing it clears the message as the person types.
 */
export function visibleIssues<F extends string>(
	all: Issues<F>,
	shown: Partial<Record<F, boolean>>,
): Issues<F> {
	return compact(
		Object.fromEntries(
			(Object.keys(all) as F[]).map((f) => [f, shown[f] ? all[f] : undefined]),
		) as Issues<F>,
	);
}

/** The field to focus after a refused submit, in visual order. */
export function firstIssueField<F extends string>(
	all: Issues<F>,
	order: readonly F[],
): F | undefined {
	return order.find((f) => all[f] !== undefined);
}

export const SOCIAL_PROVIDER_ORDER: readonly SocialAuthProvider[] = [
	"google",
	"apple",
	"facebook",
];

/** Enabled providers in display order; unknown names from the API are dropped. */
export function orderedProviders(
	enabled: readonly string[],
): SocialAuthProvider[] {
	return SOCIAL_PROVIDER_ORDER.filter((p) => enabled.includes(p));
}
