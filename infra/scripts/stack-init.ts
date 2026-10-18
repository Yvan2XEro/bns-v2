/**
 * Creates (or completes) a stack from its template, in one command.
 *
 *   bun run stack:init --stack proxmox-staging --ssh-key ~/.ssh/bns-k3s --env ../.env.proxmox-staging
 *   bun run stack:init --stack proxmox-prod --from proxmox-staging --ssh-key ~/.ssh/bns-k3s
 *
 * 1. Writes infra/.stacks/Pulumi.<stack>.yaml from stacks/<from>.example.yaml,
 *    only if it does not exist yet. .stacks/ is git-ignored: the file receives
 *    the encryption salt, encrypted secrets and plain app values, and stays on
 *    this machine. A file left at the old place (infra/Pulumi.<stack>.yaml) is
 *    moved there, untouched.
 * 2. Creates the stack, or selects it if it exists.
 * 3. With --ssh-key: stores the private key (encrypted) and its .pub.
 *    With PROXMOX_API_TOKEN in the environment: stores the API token
 *    (encrypted) — read from the environment, never from the command line.
 * 4. With --env: copies the .env in through env-to-stack (checks included).
 * Then lists what the stack still lacks before `pulumi up`.
 */
import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { LocalWorkspace } from "@pulumi/pulumi/automation";

const infraDir = path.resolve(import.meta.dir, "..");
const stacksDir = path.join(infraDir, ".stacks");

function argument(flag: string): string | undefined {
	const index = process.argv.indexOf(flag);
	return index === -1 ? undefined : process.argv[index + 1];
}

/** Relative to where the command was typed (see env-to-stack). */
function callerPath(file: string): string {
	const expanded = file.startsWith("~/")
		? path.join(homedir(), file.slice(2))
		: file;
	return path.resolve(process.env.ENV_BASE_DIR ?? process.cwd(), expanded);
}

const stackName = argument("--stack");
const from = argument("--from") ?? stackName;
const sshKey = argument("--ssh-key");
const envFile = argument("--env");

if (!stackName) {
	console.error(
		"Usage: bun run stack:init --stack <name> [--from <template>] [--ssh-key <private key>] [--env <.env>]",
	);
	process.exit(2);
}

// ── 1. Config file ───────────────────────────────────────────────────────────

mkdirSync(stacksDir, { recursive: true });
const target = path.join(stacksDir, `Pulumi.${stackName}.yaml`);
const legacy = path.join(infraDir, `Pulumi.${stackName}.yaml`);
const template = path.join(infraDir, "stacks", `${from}.example.yaml`);

if (!existsSync(target) && existsSync(legacy)) {
	renameSync(legacy, target);
	console.log(`moved   Pulumi.${stackName}.yaml → .stacks/ (unchanged)`);
} else if (!existsSync(target)) {
	if (!existsSync(template)) {
		console.error(
			`✗ no template stacks/${from}.example.yaml — pick one with --from`,
		);
		process.exit(1);
	}
	// The template's first paragraph is about the template, not this stack.
	const body = readFileSync(template, "utf8").replace(/^(#[^\n]*\n)*?#\n/, "");
	writeFileSync(
		target,
		`# Stack ${stackName}, from stacks/${from}.example.yaml. Local only (git-ignored).\n${body}`,
	);
	console.log(
		`created .stacks/Pulumi.${stackName}.yaml from stacks/${from}.example.yaml`,
	);
} else {
	console.log(`kept    .stacks/Pulumi.${stackName}.yaml (already there)`);
}

// ── 2. Stack ─────────────────────────────────────────────────────────────────

let stack: Awaited<ReturnType<typeof LocalWorkspace.createOrSelectStack>>;
try {
	stack = await LocalWorkspace.createOrSelectStack({
		stackName,
		workDir: infraDir,
	});
	await stack.workspace.selectStack(stackName);
	console.log(`stack   ${stackName} selected`);
} catch (error) {
	const reason = error instanceof Error ? error.message.split("\n").pop() : "";
	console.error(
		`✗ cannot open stack ${stackName}: install the Pulumi CLI, run pulumi login, and export PULUMI_CONFIG_PASSPHRASE.\n  ${reason}`,
	);
	process.exit(1);
}

// ── 3. Proxmox credentials ───────────────────────────────────────────────────

if (sshKey) {
	const privatePath = callerPath(sshKey);
	const publicPath = `${privatePath}.pub`;
	if (!existsSync(privatePath) || !existsSync(publicPath)) {
		console.error(`✗ ${privatePath} and ${publicPath} must both exist`);
		process.exit(1);
	}
	await stack.setAllConfig({
		"proxmox:sshPrivateKey": {
			value: readFileSync(privatePath, "utf8"),
			secret: true,
		},
		"proxmox:sshPublicKey": { value: readFileSync(publicPath, "utf8").trim() },
	});
	console.log(
		"set     proxmox:sshPrivateKey (encrypted), proxmox:sshPublicKey",
	);
}

const apiToken = process.env.PROXMOX_API_TOKEN;
if (apiToken) {
	await stack.setConfig("proxmox:apiToken", { value: apiToken, secret: true });
	console.log("set     proxmox:apiToken (encrypted)");
}

// ── 4. App variables ─────────────────────────────────────────────────────────

if (envFile) {
	const run = Bun.spawnSync(
		[
			"bun",
			"scripts/env-to-stack.ts",
			"--env",
			callerPath(envFile),
			"--stack",
			stackName,
		],
		// An absolute path: env-to-stack reads it as given.
		{ cwd: infraDir, stdout: "inherit", stderr: "inherit" },
	);
	if (run.exitCode !== 0) process.exit(run.exitCode ?? 1);
}

// ── What is still missing ────────────────────────────────────────────────────

const config = await stack.getAllConfig();
const has = (key: string) => key in config;
const missing: string[] = [];
const isProxmox = config["bns-infra:cloudProvider"]?.value === "proxmox";
if (isProxmox) {
	if (!has("proxmox:apiToken"))
		missing.push(
			"proxmox:apiToken — PROXMOX_API_TOKEN='pulumi@pve!bns=…' bun run stack:init --stack " +
				stackName,
		);
	if (!has("proxmox:sshPrivateKey"))
		missing.push("proxmox:sshPrivateKey — --ssh-key ~/.ssh/bns-k3s");
}
if (!has("bns-infra:appSecrets"))
	missing.push(
		"app variables — --env <.env> (see docs/runbook-proxmox-k3s.md § 5)",
	);
if (!has("bns-infra:ghcrToken"))
	missing.push("bns-infra:ghcrToken — GHCR_TOKEN in the .env");

if (missing.length === 0) {
	console.log(`\nReady: pulumi preview --stack ${stackName}`);
} else {
	console.log("\nStill missing before pulumi up:");
	for (const item of missing) console.log(`  · ${item}`);
}
