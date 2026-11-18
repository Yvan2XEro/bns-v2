import { APP_ENV, type AppEnvName, isKnownEnv, isSecretEnv } from "./app-env";

/**
 * KEY=value lines as Docker Compose and Dokploy read them: `export ` prefix,
 * comments, single quotes kept literal, double quotes with \n escapes and
 * values spanning several lines (a PEM key).
 */
export function parseEnv(text: string): {
	values: Map<string, string>;
	duplicates: string[];
} {
	const values = new Map<string, string>();
	const duplicates: string[] = [];
	const lines = text.replace(/\r\n/g, "\n").split("\n");
	for (let i = 0; i < lines.length; i++) {
		const line = (lines[i] ?? "").trim();
		if (!line || line.startsWith("#")) continue;
		const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(
			line,
		);
		if (!match) throw new Error(`line ${i + 1}: not KEY=value: ${line}`);
		const key = match[1] as string;
		let raw = match[2] as string;
		let value: string;
		const quote = raw[0];
		if (quote === '"' || quote === "'") {
			// Gather lines until the closing quote.
			while (!raw.slice(1).replace(/\\./g, "").includes(quote)) {
				i += 1;
				if (i >= lines.length)
					throw new Error(`${key}: the ${quote} quote is never closed`);
				raw += `\n${lines[i]}`;
			}
			const body = raw.slice(1, raw.lastIndexOf(quote));
			value =
				quote === '"'
					? body.replace(/\\n/g, "\n").replace(/\\(["\\$])/g, "$1")
					: body;
		} else {
			// Unquoted: an inline comment starts at " #".
			value = raw.replace(/\s+#.*$/, "").trim();
		}
		if (values.has(key)) duplicates.push(key);
		values.set(key, value);
	}
	return { values, duplicates };
}

/** Infra names that are stack config keys of their own, not app values. */
const STACK_KEYS: Partial<Record<AppEnvName, string>> = {
	WEB_DOMAIN: "domain",
	ACME_EMAIL: "acmeEmail",
	GHCR_TOKEN: "ghcrToken",
	IMAGE_REGISTRY: "imageRegistry",
	IMAGE_TAG: "imageTag",
};
/** Checked against WEB_DOMAIN, then dropped: the stack derives them. */
const HOST_NAMES = new Set<AppEnvName>([
	"WEB_WWW_DOMAIN",
	"API_DOMAIN",
	"CHAT_DOMAIN",
]);

export interface StackPlan {
	/** `appEnv`: plain values. */
	plain: Record<string, string>;
	/** `appSecrets`: values stored encrypted. */
	secret: Record<string, string>;
	/** domain, acmeEmail, ghcrToken. */
	stackKeys: Record<string, { value: string; secret: boolean }>;
	/** Any of these blocks the write. */
	errors: string[];
	/** Names present but deliberately not copied, and why. */
	notes: string[];
}

/** What a `.env` becomes in the stack, and everything wrong with it. */
export function planStackConfig(
	values: Map<string, string>,
	duplicates: string[] = [],
): StackPlan {
	const errors: string[] = [];
	const notes: string[] = [];

	for (const key of duplicates)
		errors.push(`${key} is set more than once: keep one value`);

	for (const key of values.keys())
		if (!isKnownEnv(key))
			errors.push(
				`${key} is not in infra/src/app-env.ts: add it (which services, secret or not) so it is not lost`,
			);

	for (const [name, entry] of Object.entries(APP_ENV) as [
		AppEnvName,
		(typeof APP_ENV)[AppEnvName],
	][])
		if ("required" in entry && entry.required && !values.get(name))
			errors.push(`${name} is required and missing or empty`);

	const domain = values.get("WEB_DOMAIN") ?? "";
	if (domain) {
		const expected: Partial<Record<AppEnvName, string>> = {
			WEB_WWW_DOMAIN: `www.${domain}`,
			API_DOMAIN: `api.${domain}`,
			CHAT_DOMAIN: `chat.${domain}`,
		};
		for (const [name, host] of Object.entries(expected)) {
			const value = values.get(name);
			if (value && value !== host)
				errors.push(
					`${name}=${value}, but the stack serves ${host} (it derives www., api. and chat. from WEB_DOMAIN)`,
				);
		}
	}

	const storage = values.get("STORAGE_PROVIDER") ?? "";
	if (storage !== "s3" && storage !== "azure")
		errors.push(
			`STORAGE_PROVIDER=${storage || "(unset)"}: the API runs two pods without a shared disk, so uploads must go to s3 or azure`,
		);

	const plain: Record<string, string> = {};
	const secret: Record<string, string> = {};
	const stackKeys: StackPlan["stackKeys"] = {};

	for (const [key, value] of values) {
		if (!isKnownEnv(key)) continue;
		const entry = APP_ENV[key];
		if (entry.kind === "derived") {
			notes.push(`${key} ignored: the stack sets it (${entry.note})`);
			continue;
		}
		if (entry.kind === "dokploy") {
			notes.push(`${key} ignored: only used by the Compose deployment`);
			continue;
		}
		if (value === "" || HOST_NAMES.has(key)) continue;
		const stackKey = STACK_KEYS[key];
		if (stackKey) stackKeys[stackKey] = { value, secret: isSecretEnv(key) };
		else if (isSecretEnv(key)) secret[key] = value;
		else plain[key] = value;
	}

	return { plain, secret, stackKeys, errors, notes };
}

// `config set --path` stores 1, 0.1 or true as numbers and booleans, while
// environment variables (and a ConfigMap's data) are text: back to strings.
export function asEnvStrings(
	values: Record<string, unknown> | undefined,
): Record<string, string> {
	return Object.fromEntries(
		Object.entries(values ?? {}).map(([key, value]) => [key, String(value)]),
	);
}
