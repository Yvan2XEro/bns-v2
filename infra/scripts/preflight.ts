/**
 * Production preflight: is the stack ready to deploy, and once deployed, is
 * it healthy? Read-only — it changes nothing and never prints a secret value.
 *
 *   make check                                    (azure-prod)
 *   make check STACK=azure-prod ENV_FILE=.env.azure-prod STAGING_ENV=.env.staging
 *   bun scripts/preflight.ts --stack azure-prod [--env <file>] [--staging-env <file>]
 *
 * Sections run in order; the live ones are skipped while the cluster does
 * not exist yet. Exit code 1 when any check fails (✗); warnings (⚠) do not.
 */
import { resolve4 } from "node:dns/promises";
import path from "node:path";
import { parseEnv } from "../src/env-plan";

const infraDir = path.resolve(import.meta.dir, "..");
const repoDir = path.resolve(infraDir, "..");

function argument(flag: string): string | undefined {
	const i = process.argv.indexOf(flag);
	return i >= 0 ? process.argv[i + 1] : undefined;
}
const stack = argument("--stack") ?? "azure-prod";
const envFile = argument("--env");
const stagingEnvFile = argument("--staging-env");

// ─── Reporting ───────────────────────────────────────────────────────────────

let failures = 0;
let warnings = 0;
const ok = (msg: string) => console.log(`  ✓ ${msg}`);
const warn = (msg: string, hint?: string) => {
	warnings++;
	console.log(`  ⚠ ${msg}${hint ? `\n      → ${hint}` : ""}`);
};
const fail = (msg: string, hint?: string) => {
	failures++;
	console.log(`  ✗ ${msg}${hint ? `\n      → ${hint}` : ""}`);
};
const section = (title: string) => console.log(`\n── ${title}`);

async function run(cmd: string[], cwd = infraDir) {
	const proc = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
	const [stdout, stderr, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { code, stdout: stdout.trim(), stderr: stderr.trim() };
}
const has = async (tool: string) =>
	(await run(["sh", "-c", `command -v ${tool}`])).code === 0;

// ─── 1. Tools and sessions ───────────────────────────────────────────────────

section("Tools and sessions");
for (const tool of ["pulumi", "az", "kubectl", "docker"]) {
	if (await has(tool)) ok(`${tool} installed`);
	else fail(`${tool} not installed`);
}
if ((await run(["pulumi", "whoami"])).code === 0) ok("pulumi logged in");
else fail("pulumi not logged in", "pulumi login");
if ((await run(["az", "account", "show", "-o", "none"])).code === 0)
	ok("az logged in");
else fail("az not logged in", "az login");

// ─── 2. Stack configuration ──────────────────────────────────────────────────

section(`Stack ${stack}`);
type ConfigEntry = { value?: string; objectValue?: unknown; secret: boolean };
const configRun = await run([
	"pulumi",
	"config",
	"--json",
	"--show-secrets",
	"--stack",
	stack,
]);
if (configRun.code !== 0) {
	fail("cannot read the stack config", configRun.stderr.split("\n")[0]);
	finish();
}
const config = JSON.parse(configRun.stdout) as Record<string, ConfigEntry>;
const get = (key: string) => config[`bns-infra:${key}`];
const str = (key: string) => get(key)?.value ?? "";
const obj = <T>(key: string): T | undefined => {
	const entry = get(key);
	if (!entry) return undefined;
	if (entry.objectValue !== undefined) return entry.objectValue as T;
	try {
		return JSON.parse(entry.value ?? "") as T;
	} catch {
		return undefined;
	}
};

const cloud = str("cloudProvider");
if (cloud === "azure") ok("cloudProvider: azure");
else
	warn(`cloudProvider: ${cloud || "(unset)"}`, "this check knows Azure best");

const domain = str("domain");
if (domain) ok(`domain: ${domain}`);
else fail("domain is not set");
if (str("tlsIssuer") === "local-ca")
	warn("tlsIssuer: local-ca — browsers will not trust it in production");
else if (str("acmeEmail") && !str("acmeEmail").endsWith("@email.com"))
	ok("Let's Encrypt contact email set");
else
	fail(
		"acmeEmail is unset or still the template's",
		"pulumi config set acmeEmail you@domain",
	);

const tag = str("imageTag");
if (/^v\d+\.\d+\.\d+$/.test(tag)) ok(`imageTag: ${tag}`);
else
	fail(
		`imageTag: ${tag || "(unset)"} — production runs a release tag`,
		"pulumi config set imageTag v1.2.3",
	);
if (get("ghcrToken")?.value) ok("ghcrToken set");
else fail("ghcrToken missing", "the cluster cannot pull the images");

const paused = str("apiPaused") === "true";
if (paused)
	warn(
		"apiPaused: true — the API is not deployed",
		"expected during the first restore only",
	);
else ok("API deployed (apiPaused off)");

const database = str("database") || "in-cluster";
if (database === "atlas") {
	const atlas = obj<{ orgId?: string; accessCidrs?: string[] }>("atlas");
	if (atlas?.orgId && !atlas.orgId.startsWith("your-"))
		ok("database: atlas, orgId set");
	else fail("database: atlas without a real atlas.orgId");
	if (
		process.env.MONGODB_ATLAS_PUBLIC_KEY &&
		process.env.MONGODB_ATLAS_PRIVATE_KEY
	)
		ok("Atlas API key in the shell");
	else fail("MONGODB_ATLAS_PUBLIC_KEY / _PRIVATE_KEY not exported");
	if (atlas?.accessCidrs?.length && !paused)
		warn(
			"atlas.accessCidrs still open while the API runs",
			"remove it after the restore",
		);
} else {
	const backup = obj<{ retentionDays?: number }>("mongoBackup");
	if (backup)
		ok(
			`database: in-cluster with nightly backups (${backup.retentionDays ?? 30} days)`,
		);
	else
		fail(
			"database: in-cluster without mongoBackup — production would have no backup",
			"add bns-infra:mongoBackup (see stacks/azure-prod.example.yaml)",
		);
}

// ─── 3. Application secrets and settings ─────────────────────────────────────

section("Application values");
const appEnv = obj<Record<string, string>>("appEnv") ?? {};
let appSecrets: Record<string, string> = {};
try {
	appSecrets = JSON.parse(get("appSecrets")?.value ?? "{}");
} catch {
	fail("appSecrets is not readable JSON");
}
const value = (name: string) => appSecrets[name] ?? appEnv[name] ?? "";

const REQUIRED_SECRETS: Array<[string, string]> = [
	["PAYLOAD_SECRET", "signs sessions and documents"],
	["MONGO_PASSWORD", "the database password"],
	["REDIS_PASSWORD", "the cache password"],
	["MEILI_MASTER_KEY", "the search key"],
	["ORDER_PHONE_PEPPER", "buyer-phone refusal scores"],
	["RISK_HASH_SECRET", "risk signals"],
	["VERIFICATION_HASH_PEPPER", "verification hashes"],
];
const PLACEHOLDER = /change-?me|your-|example|^x+$/i;
for (const [name, why] of REQUIRED_SECRETS) {
	const v = appSecrets[name] ?? "";
	if (!v) fail(`${name} missing (${why})`);
	else if (PLACEHOLDER.test(v)) fail(`${name} is a placeholder (${why})`);
	else if (
		v.length < 32 &&
		name !== "MONGO_PASSWORD" &&
		name !== "REDIS_PASSWORD"
	)
		warn(`${name} is shorter than 32 characters`);
	else ok(`${name} set`);
}

const storage = value("STORAGE_PROVIDER") || "local";
if (storage === "local")
	fail(
		"STORAGE_PROVIDER is local — the API pods have no volume, uploads would vanish",
		"use azure (or s3) with a public and a private container",
	);
else if (storage === "azure") {
	const pub = value("AZURE_STORAGE_CONTAINER_NAME");
	const priv = value("AZURE_STORAGE_PRIVATE_CONTAINER_NAME");
	if (value("AZURE_STORAGE_CONNECTION_STRING") && pub && priv && pub !== priv)
		ok(`storage: azure (${pub}, private ${priv})`);
	else
		fail("azure storage needs a connection string and two distinct containers");
} else if (storage === "s3") {
	const pub = value("S3_BUCKET");
	const priv = value("S3_PRIVATE_BUCKET");
	if (value("S3_ACCESS_KEY_ID") && pub && priv && pub !== priv)
		ok(`storage: s3 (${pub}, private ${priv})`);
	else fail("s3 storage needs keys and two distinct buckets");
}

if (value("NOTCHPAY_PUBLIC_KEY") && value("NOTCHPAY_HASH_KEY")) {
	if (/^(pk|sb)\.test|test_|sandbox/i.test(value("NOTCHPAY_PUBLIC_KEY")))
		warn("NotchPay public key looks like a sandbox key");
	else ok("NotchPay keys set");
} else fail("NotchPay keys missing (NOTCHPAY_PUBLIC_KEY, NOTCHPAY_HASH_KEY)");

if (value("EMAIL_PROVIDER") || value("RESEND_API_KEY") || value("SMTP_HOST"))
	ok("email configured");
else warn("no email provider — password resets and receipts will not be sent");
for (const name of [
	"GOOGLE_OAUTH_CLIENT_ID",
	"NOVU_SECRET_KEY",
	"SENTRY_DSN",
]) {
	if (value(name)) ok(`${name} set`);
	else warn(`${name} not set`);
}
if (!value("PIXABAY_API_KEY"))
	warn("PIXABAY_API_KEY not set — categories will be created without photos");

if (envFile) {
	const check = await run([
		"bun",
		"scripts/env-to-stack.ts",
		"--dry-run",
		"--env",
		path.resolve(repoDir, envFile),
		"--stack",
		stack,
	]);
	if (check.code === 0) ok(`${envFile} matches the stack (env:check)`);
	else
		fail(
			`${envFile} does not pass env:check`,
			`bun run infra:env:check --env ${envFile} --stack ${stack}`,
		);
}

if (stagingEnvFile) {
	// The restored data holds hashes made with staging's peppers.
	const staging = Object.fromEntries(
		parseEnv(await Bun.file(path.resolve(repoDir, stagingEnvFile)).text())
			.values,
	);
	for (const name of [
		"ORDER_PHONE_PEPPER",
		"RISK_HASH_SECRET",
		"VERIFICATION_HASH_PEPPER",
	]) {
		if (!staging[name]) warn(`${name} absent from ${stagingEnvFile}`);
		else if (staging[name] === appSecrets[name]) ok(`${name} matches staging`);
		else
			fail(
				`${name} differs from staging — restored hashes would stop matching`,
			);
	}
}

// ─── 4. Release images ───────────────────────────────────────────────────────

section(`Images ${tag || "(no tag)"}`);
const registry = str("imageRegistry") || "ghcr.io/yvan2xero/bns-v2";
if (tag) {
	for (const service of ["api", "web", "chat-service", "search-indexer"]) {
		const image = `${registry}/${service}:${tag}`;
		const inspect = await run(["docker", "manifest", "inspect", image]);
		if (inspect.code === 0) ok(image);
		else if (/unauthorized|denied/i.test(inspect.stderr))
			warn(`${image}: registry refused`, "docker login ghcr.io, then rerun");
		else
			fail(
				`${image} not found`,
				`git push origin ${tag} and wait for "Build & Push"`,
			);
	}
}

// ─── 5. Live cluster ─────────────────────────────────────────────────────────

section("Live cluster");
const outputs = await run([
	"pulumi",
	"stack",
	"output",
	"--json",
	"--stack",
	stack,
]);
const out =
	outputs.code === 0
		? (JSON.parse(outputs.stdout || "{}") as Record<string, unknown>)
		: {};
const clusterName = typeof out.clusterName === "string" ? out.clusterName : "";
if (!clusterName) {
	warn(
		"not deployed yet — live checks skipped",
		`make infra-up STACK=${stack}`,
	);
	finish();
}
const context = (await run(["kubectl", "config", "current-context"])).stdout;
if (!context.includes(clusterName)) {
	warn(
		`kubectl context "${context}" is not ${clusterName} — live checks skipped`,
		`az aks get-credentials --name ${clusterName} --resource-group <rg>`,
	);
	finish();
}
ok(`kubectl on ${clusterName}`);

const pods = await run(["kubectl", "-n", "bns", "get", "pods", "-o", "json"]);
if (pods.code !== 0)
	fail("cannot list pods in bns", pods.stderr.split("\n")[0]);
else {
	type Pod = {
		metadata: { name: string; labels?: Record<string, string> };
		status: {
			phase: string;
			containerStatuses?: { ready: boolean; restartCount: number }[];
		};
	};
	const items = (JSON.parse(pods.stdout).items as Pod[]).filter(
		(p) => p.metadata.labels?.app !== "mongodb-backup",
	);
	const expected = [
		"web",
		"chat-service",
		"search-indexer",
		"redis",
		"meilisearch",
		...(paused ? [] : ["api"]),
		...(database === "atlas" ? [] : ["mongodb"]),
	];
	for (const app of expected) {
		const mine = items.filter((p) => p.metadata.labels?.app === app);
		const ready = mine.filter((p) =>
			p.status.containerStatuses?.every((c) => c.ready),
		);
		const restarts = mine.reduce(
			(n, p) =>
				n +
				(p.status.containerStatuses ?? []).reduce(
					(m, c) => m + c.restartCount,
					0,
				),
			0,
		);
		if (ready.length === 0)
			fail(
				`${app}: no ready pod (${mine.length} found)`,
				`kubectl -n bns describe pod -l app=${app}`,
			);
		else if (restarts > 5)
			warn(
				`${app}: ${ready.length}/${mine.length} ready, ${restarts} restarts`,
				`kubectl -n bns logs -l app=${app} --previous`,
			);
		else ok(`${app}: ${ready.length}/${mine.length} ready`);
	}
}

if (database !== "atlas" && obj("mongoBackup")) {
	const jobs = await run([
		"kubectl",
		"-n",
		"bns",
		"get",
		"jobs",
		"-l",
		"app=mongodb-backup",
		"-o",
		"json",
	]);
	const cron = await run([
		"kubectl",
		"-n",
		"bns",
		"get",
		"cronjob",
		"mongodb-backup",
		"-o",
		"json",
	]);
	if (cron.code !== 0) fail("backup CronJob mongodb-backup missing");
	else {
		const last = JSON.parse(cron.stdout).status?.lastSuccessfulTime as
			| string
			| undefined;
		const age = last
			? (Date.now() - Date.parse(last)) / 3_600_000
			: Number.POSITIVE_INFINITY;
		if (!last)
			warn(
				"no successful backup yet",
				"kubectl -n bns create job --from=cronjob/mongodb-backup first-backup",
			);
		else if (age > 26)
			fail(
				`last successful backup ${Math.round(age)} h ago`,
				"kubectl -n bns get jobs -l app=mongodb-backup",
			);
		else ok(`last successful backup ${Math.round(age)} h ago`);
	}
	if (jobs.code === 0) {
		type Job = { status: { failed?: number; succeeded?: number } };
		const failed = (JSON.parse(jobs.stdout).items as Job[]).filter(
			(j) => (j.status.failed ?? 0) > 0 && !j.status.succeeded,
		).length;
		if (failed) warn(`${failed} failed backup job(s) kept in history`);
	}
	const account =
		typeof out.backupStorageAccount === "string"
			? out.backupStorageAccount
			: "";
	if (account) {
		const blobs = await run([
			"az",
			"storage",
			"blob",
			"list",
			"--only-show-errors",
			"--auth-mode",
			"key",
			"--account-name",
			account,
			"--container-name",
			"mongo-backups",
			"--query",
			"length(@)",
			"-o",
			"tsv",
		]);
		if (blobs.code === 0)
			ok(`${blobs.stdout} archive(s) in ${account}/mongo-backups`);
		else
			warn(`cannot list ${account}/mongo-backups`, blobs.stderr.split("\n")[0]);
	}
	const pvc = await run([
		"kubectl",
		"-n",
		"bns",
		"get",
		"pvc",
		"data-mongodb-0",
		"-o",
		"jsonpath={.spec.storageClassName}",
	]);
	if (pvc.stdout === "bns-mongodb-retain")
		ok("MongoDB disk on the Retain class");
	else
		warn(
			`MongoDB disk on "${pvc.stdout || "?"}", not bns-mongodb-retain`,
			"a claim made before mongoBackup keeps its class (runbook, option B)",
		);
}

// DNS and HTTPS
const svc = await run([
	"kubectl",
	"-n",
	"ingress-nginx",
	"get",
	"svc",
	"-o",
	'jsonpath={range .items[?(@.spec.type=="LoadBalancer")]}{.status.loadBalancer.ingress[0].ip}{end}',
]);
const ingressIp = svc.stdout;
if (ingressIp) ok(`ingress IP ${ingressIp}`);
else fail("the ingress has no public IP yet");
for (const host of [
	domain,
	`www.${domain}`,
	`api.${domain}`,
	`chat.${domain}`,
]) {
	const ips = await resolve4(host).catch(() => [] as string[]);
	if (ips.length === 0)
		fail(
			`${host} does not resolve`,
			`A record → ${ingressIp || "the ingress IP"}`,
		);
	else if (ingressIp && !ips.includes(ingressIp))
		fail(`${host} → ${ips.join(", ")}, not the ingress ${ingressIp}`);
	else ok(`${host} → ${ips.join(", ")}`);
}
const probes: Array<[string, string]> = [
	[`https://${domain}/`, "web"],
	...(paused
		? []
		: ([[`https://api.${domain}/api/public/config`, "api"]] as Array<
				[string, string]
			>)),
];
for (const [url, name] of probes) {
	try {
		const res = await fetch(url, {
			redirect: "manual",
			signal: AbortSignal.timeout(15_000),
		});
		if (res.status < 400) ok(`${name}: ${url} → ${res.status}`);
		else fail(`${name}: ${url} → ${res.status}`);
	} catch (error) {
		fail(
			`${name}: ${url} unreachable`,
			String((error as Error).message).split("\n")[0],
		);
	}
}

finish();

function finish(): never {
	console.log(
		`\n${failures ? "✗" : "✓"} ${failures} failure(s), ${warnings} warning(s) — stack ${stack}`,
	);
	process.exit(failures ? 1 : 0);
}
