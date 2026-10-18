/**
 * Copies a production `.env` (the one Dokploy runs today) into a Pulumi stack,
 * so the Kubernetes deployment starts with exactly the same variables.
 *
 *   bun run infra:env:check --env .env.prod --stack proxmox-prod   (from the repo root)
 *   bun run infra:env:apply --env .env.prod --stack proxmox-prod
 * or, inside infra/: bun run env:check / env:apply with the same flags.
 *
 * Nothing is written unless every check passes:
 *   - every name in the file is known to src/app-env.ts (a variable added to
 *     Dokploy but not to the catalog would otherwise be lost on the way);
 *   - the required ones are set, and no name appears twice;
 *   - the hosts follow the stack's layout (www., api., chat. of WEB_DOMAIN);
 *   - uploads go to S3 or Azure (local disk does not survive two API pods).
 * Then `appEnv` and `appSecrets` are replaced as a whole — a variable removed
 * from the file leaves the stack too — and secrets are stored encrypted.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import {
	type ConfigMap,
	LocalWorkspace,
	type Stack,
} from "@pulumi/pulumi/automation";
import { APP_ENV_CONFIG_KEY, APP_SECRETS_CONFIG_KEY } from "../src/app-env";
import { parseEnv, planStackConfig } from "../src/env-plan";

// ── Arguments ────────────────────────────────────────────────────────────────

function argument(flag: string): string | undefined {
	const index = process.argv.indexOf(flag);
	return index === -1 ? undefined : process.argv[index + 1];
}

const envFile = argument("--env");
const stackName = argument("--stack");
const dryRun = process.argv.includes("--dry-run");

if (!envFile || !stackName) {
	console.error(
		"Usage: bun scripts/env-to-stack.ts --env <file> --stack <name> [--dry-run]",
	);
	process.exit(2);
}

// ── Plan ─────────────────────────────────────────────────────────────────────

const { values, duplicates } = parseEnv(
	readFileSync(
		// Relative to where the command was typed: the root package's
		// shortcuts pass their directory, as `bun run --cwd` moves into infra/.
		path.resolve(process.env.ENV_BASE_DIR ?? process.cwd(), envFile),
		"utf8",
	),
);
const { plain, secret, stackKeys, errors, notes } = planStackConfig(
	values,
	duplicates,
);

const mask = (value: string) => `•••• (${value.length} chars)`;

console.log(`\n${envFile} → stack ${stackName}${dryRun ? " (dry run)" : ""}\n`);
console.log(
	`  plain   (${APP_ENV_CONFIG_KEY}):   ${Object.keys(plain).length}`,
);
console.log(
	`  secrets (${APP_SECRETS_CONFIG_KEY}): ${Object.keys(secret).length}`,
);
for (const [key, { value, secret: isSecret }] of Object.entries(stackKeys))
	console.log(`  ${key}: ${isSecret ? mask(value) : value}`);
for (const note of notes) console.log(`  · ${note}`);

if (errors.length > 0) {
	console.error(`\n${errors.length} problem(s), nothing written:`);
	for (const error of errors) console.error(`  ✗ ${error}`);
	process.exit(1);
}

// ── Stack ────────────────────────────────────────────────────────────────────

let stack: Stack;
try {
	stack = await LocalWorkspace.selectStack({
		stackName,
		workDir: path.resolve(import.meta.dir, ".."),
	});
} catch (error) {
	const reason = error instanceof Error ? error.message.split("\n").pop() : "";
	if (dryRun) {
		console.log(
			`\nThe file passes every check. Stack not compared (${reason?.trim() || "Pulumi unavailable"}).`,
		);
		process.exit(0);
	}
	console.error(
		`\n✗ Cannot open stack ${stackName}: install the Pulumi CLI, run pulumi login and pulumi stack init ${stackName}, and export PULUMI_CONFIG_PASSPHRASE.\n  ${reason}`,
	);
	process.exit(1);
}

/** Names whose value differs from what the stack holds now. */
async function diff(): Promise<void> {
	const current = await stack.getAllConfig();
	const read = (key: string): Record<string, string> => {
		const entry = Object.entries(current).find(([name]) =>
			name.endsWith(`:${key}`),
		)?.[1];
		if (!entry) return {};
		try {
			return JSON.parse(entry.value) as Record<string, string>;
		} catch {
			return {};
		}
	};
	const before = {
		...read(APP_ENV_CONFIG_KEY),
		...read(APP_SECRETS_CONFIG_KEY),
	};
	const after = { ...plain, ...secret };
	const added = Object.keys(after).filter((key) => !(key in before));
	const removed = Object.keys(before).filter((key) => !(key in after));
	const changed = Object.keys(after).filter(
		(key) => key in before && before[key] !== after[key],
	);
	console.log("\nChanges against the stack:");
	if (added.length + removed.length + changed.length === 0)
		console.log("  none: the stack already matches this file");
	for (const key of added) console.log(`  + ${key}`);
	for (const key of changed) console.log(`  ~ ${key}`);
	for (const key of removed) console.log(`  - ${key} (no longer in the file)`);
}

await diff();

// The stack needs these; from the file or already set on the stack.
const current = await stack.getAllConfig();
for (const key of ["acmeEmail", "ghcrToken"]) {
	const set = Object.keys(current).some((name) => name.endsWith(`:${key}`));
	if (!stackKeys[key] && !set) {
		const envName = key === "acmeEmail" ? "ACME_EMAIL" : "GHCR_TOKEN";
		console.error(
			`\n✗ ${key} is not on the stack: add ${envName} to the file, or run pulumi config set${key === "ghcrToken" ? " --secret" : ""} ${key} …`,
		);
		process.exit(1);
	}
}

if (dryRun) {
	console.log("\nDry run: nothing written.");
	process.exit(0);
}

// Replace both maps whole, so the stack holds exactly the file's variables.
for (const key of [APP_ENV_CONFIG_KEY, APP_SECRETS_CONFIG_KEY]) {
	try {
		await stack.removeConfig(key);
	} catch {
		// Not set yet.
	}
}

const config: ConfigMap = {};
for (const [key, value] of Object.entries(plain))
	config[`${APP_ENV_CONFIG_KEY}.${key}`] = { value };
for (const [key, value] of Object.entries(secret))
	config[`${APP_SECRETS_CONFIG_KEY}.${key}`] = { value, secret: true };
for (const [key, { value, secret: isSecret }] of Object.entries(stackKeys))
	config[key] = { value, secret: isSecret };

await stack.setAllConfig(config, true);
console.log(
	`\nWritten to ${stackName}. Next: pulumi preview --stack ${stackName}`,
);
