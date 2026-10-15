import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
	NotchPayTransport,
	WireRequest,
	WireResponse,
} from "../../../src/lib/payments/notchpayWire";

export interface NotchPayFixture {
	key: string;
	request: { method: string; path: string; when?: string };
	response: { status: number; body: unknown };
	sets?: string;
	binds?: Record<string, string>;
	assumed?: string[];
}

const FIXTURE_DIR = join(import.meta.dirname, "..", "fixtures", "notchpay");

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

function matchPath(
	pattern: string,
	path: string,
): Record<string, string> | null {
	const want = pattern.split("/");
	const got = path.split("/");
	if (want.length !== got.length) return null;
	const tokens: Record<string, string> = {};
	for (let i = 0; i < want.length; i++) {
		const part = want[i] as string;
		const token = /^\{(\w+)\}$/.exec(part);
		if (token)
			tokens[token[1] as string] = decodeURIComponent(got[i] as string);
		else if (part !== got[i]) return null;
	}
	return tokens;
}

export function substitute(
	value: unknown,
	env: Record<string, string>,
): unknown {
	if (typeof value === "string") {
		return value.replace(
			/\{(\w+)\}/g,
			(whole, name: string) => env[name] ?? whole,
		);
	}
	if (Array.isArray(value)) return value.map((item) => substitute(item, env));
	if (isObject(value)) {
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [key, substitute(item, env)]),
		);
	}
	return value;
}

function capture(request: WireRequest, expression: string): string | null {
	let cursor: unknown = { body: request.body, query: request.query };
	for (const step of expression.split(".")) {
		if (!isObject(cursor)) return null;
		cursor = cursor[step];
	}
	return typeof cursor === "string" ? cursor : null;
}

export class ReplayTransport {
	readonly journal: WireRequest[] = [];
	private readonly modes = new Map<string, string>();
	private readonly bound: Record<string, string> = {};

	constructor(private readonly fixtures: NotchPayFixture[]) {}

	setMode(key: string, value: string): void {
		this.modes.set(key, value);
	}

	replaceFixture(old: NotchPayFixture, next: NotchPayFixture): void {
		const at = this.fixtures.indexOf(old);
		if (at >= 0) this.fixtures[at] = next;
	}

	private modeHolds(when: string, env: Record<string, string>): boolean {
		const [key = "", expected = ""] = String(substitute(when, env)).split("=");
		return (this.modes.get(key) ?? "initial") === expected;
	}

	/** Picks the fixture for a request and applies its binds and mode change. */
	resolve(request: WireRequest): {
		fixture: NotchPayFixture;
		env: Record<string, string>;
		set?: [string, string];
	} {
		const bodyFields = isObject(request.body)
			? Object.fromEntries(
					Object.entries(request.body).filter(
						(entry): entry is [string, string] => typeof entry[1] === "string",
					),
				)
			: {};
		for (const fixture of this.fixtures) {
			if (fixture.request.method !== request.method) continue;
			const pathTokens = matchPath(fixture.request.path, request.path);
			if (!pathTokens) continue;
			const env = { ...this.bound, ...bodyFields, ...pathTokens };
			if (fixture.request.when && !this.modeHolds(fixture.request.when, env))
				continue;
			for (const [name, expression] of Object.entries(fixture.binds ?? {})) {
				const value = capture(request, expression);
				if (value !== null) {
					this.bound[name] = value;
					env[name] = value;
				}
			}
			Object.assign(this.bound, bodyFields, pathTokens);
			let set: [string, string] | undefined;
			if (fixture.sets) {
				const [key = "", value = ""] = String(
					substitute(fixture.sets, env),
				).split("=");
				this.modes.set(key, value);
				set = [key, value];
			}
			return { fixture, env, set };
		}
		throw new Error(
			`no NotchPay fixture for ${request.method} ${request.path}`,
		);
	}

	transport(): NotchPayTransport {
		return async (request): Promise<WireResponse> => {
			this.journal.push(request);
			const { fixture, env } = this.resolve(request);
			return {
				status: fixture.response.status,
				body: substitute(fixture.response.body, env),
			};
		};
	}
}

export function loadNotchpayFixtures(
	dir: string = FIXTURE_DIR,
): NotchPayFixture[] {
	let files: string[];
	try {
		files = readdirSync(dir)
			.filter((name) => name.endsWith(".json"))
			.sort();
	} catch {
		return [];
	}
	return files.flatMap((name) => {
		const parsed: unknown = JSON.parse(readFileSync(join(dir, name), "utf8"));
		return (Array.isArray(parsed) ? parsed : [parsed]) as NotchPayFixture[];
	});
}

const TOKEN = /\{(\w+)\}/g;
const ECHOED_CREDENTIALS = new Set(["authorization", "x-grant"]);
const REDACTED = "[redacted]";

const tokensOf = (value: unknown): string[] =>
	[...JSON.stringify(value ?? "").matchAll(TOKEN)].map((m) => m[1] as string);

function scrub(value: unknown, secrets: string[]): unknown {
	if (typeof value === "string")
		return secrets.reduce((text, s) => text.split(s).join(REDACTED), value);
	if (Array.isArray(value)) return value.map((item) => scrub(item, secrets));
	if (isObject(value)) {
		return Object.fromEntries(
			Object.entries(value)
				.filter(([key]) => !ECHOED_CREDENTIALS.has(key.toLowerCase()))
				.map(([key, item]) => [key, scrub(item, secrets)]),
		);
	}
	return value;
}

/**
 * Turns a live value back into the skeleton's placeholders. A skeleton string
 * whose placeholders the live value does not carry is an id the server minted
 * (the replay derives it from the request instead), so the skeleton string is
 * kept and the minted pair reported.
 */
function tokenise(
	live: unknown,
	skeleton: unknown,
	env: Record<string, string>,
	names: string[],
	minted: Array<{ expected: string; live: string }>,
): unknown {
	if (typeof live === "string") {
		const swapped = names
			.filter((name) => env[name])
			.sort((a, b) => (env[b] as string).length - (env[a] as string).length)
			.reduce(
				(text, name) => text.split(env[name] as string).join(`{${name}}`),
				live,
			);
		if (typeof skeleton !== "string") return swapped;
		const wanted = tokensOf(skeleton);
		if (wanted.length === 0 || wanted.every((t) => swapped.includes(`{${t}}`)))
			return swapped;
		minted.push({ expected: String(substitute(skeleton, env)), live });
		return skeleton;
	}
	if (typeof live === "number") {
		const whole = typeof skeleton === "string" && /^\{(\w+)\}$/.exec(skeleton);
		return whole && env[whole[1] as string] === String(live) ? skeleton : live;
	}
	if (Array.isArray(live)) {
		const parts = Array.isArray(skeleton) ? skeleton : [];
		return live.map((item, i) => tokenise(item, parts[i], env, names, minted));
	}
	if (isObject(live)) {
		const parts = isObject(skeleton) ? skeleton : {};
		return Object.fromEntries(
			Object.entries(live).map(([key, item]) => [
				key,
				tokenise(item, parts[key], env, names, minted),
			]),
		);
	}
	return live;
}

interface WebhookTemplateFile {
	key: string;
	body: unknown;
	assumed?: string[];
}

type Carrier = { assumed?: string[] };

function readFiles<T>(dir: string): Map<string, T[]> {
	const files = new Map<string, T[]>();
	let names: string[] = [];
	try {
		names = readdirSync(dir)
			.filter((name) => name.endsWith(".json"))
			.sort();
	} catch {
		return files;
	}
	for (const name of names) {
		const parsed: unknown = JSON.parse(readFileSync(join(dir, name), "utf8"));
		files.set(
			join(dir, name),
			(Array.isArray(parsed) ? parsed : [parsed]) as T[],
		);
	}
	return files;
}

const writeJson = (file: string, value: unknown) =>
	writeFileSync(file, `${JSON.stringify(value, null, "\t")}\n`);

export interface RecordSummary {
	/** Tags this run removed from the fixtures it overwrote. */
	cleared: string[];
	/** Tags still carried by a fixture the run did not reach. */
	stillAssumed: string[];
	/** Every tag cleared so far, across runs: the manifest's input. */
	verified: string[];
}

/**
 * Wraps a live transport and rewrites the fixture of every call it forwards.
 * The existing fixtures are only the skeleton: they pick the fixture for a
 * call and keep its request pattern, binds and mode change, which is what the
 * replay needs. The response, and the absence of `assumed`, are the live
 * truth. A recorded fixture replaces the old one wholesale, never merges.
 */
export class RecordTransport {
	readonly journal: WireRequest[] = [];
	private readonly replay: ReplayTransport;
	private readonly files: Map<string, NotchPayFixture[]>;
	private readonly webhookFiles: Map<string, WebhookTemplateFile[]>;
	private readonly manifestFile: string;
	private readonly before: Set<string>;
	private readonly priorVerified: string[];

	constructor(
		private readonly inner: NotchPayTransport,
		private readonly options: { dir?: string; secrets?: string[] } = {},
	) {
		const dir = options.dir ?? FIXTURE_DIR;
		this.files = readFiles<NotchPayFixture>(dir);
		this.webhookFiles = readFiles<WebhookTemplateFile>(join(dir, "webhooks"));
		this.manifestFile = join(dir, "manifest", "verified.json");
		this.replay = new ReplayTransport([...this.files.values()].flat());
		this.priorVerified = readVerified(this.manifestFile);
		this.before = this.openTags();
	}

	setMode(key: string, value: string): void {
		this.replay.setMode(key, value);
	}

	private carriers(): Carrier[] {
		return [
			...[...this.files.values()].flat(),
			...[...this.webhookFiles.values()].flat(),
		];
	}

	private openTags(): Set<string> {
		return new Set(this.carriers().flatMap((c) => c.assumed ?? []));
	}

	transport(): NotchPayTransport {
		return async (request) => {
			this.journal.push(request);
			const { fixture, env, set } = this.replay.resolve(request);
			const response = await this.inner(request);
			if (response.status >= 500) return response;
			const secrets = this.options.secrets ?? [];
			const names = [
				...new Set(
					tokensOf([
						fixture.request.path,
						fixture.response.body,
						fixture.sets,
						fixture.request.when,
					]),
				),
			];
			const minted: Array<{ expected: string; live: string }> = [];
			const body = tokenise(
				scrub(response.body, secrets),
				fixture.response.body,
				env,
				names,
				minted,
			);
			// The mode just set was keyed on the id the skeleton predicted.
			if (set)
				for (const { expected, live } of minted)
					if (set[0].includes(expected))
						this.replay.setMode(set[0].split(expected).join(live), set[1]);
			this.overwrite(fixture, { status: response.status, body });
			return response;
		};
	}

	private overwrite(
		fixture: NotchPayFixture,
		response: NotchPayFixture["response"],
	): void {
		for (const [file, list] of this.files) {
			const at = list.indexOf(fixture);
			if (at < 0) continue;
			const next: NotchPayFixture = {
				key: fixture.key,
				request: fixture.request,
				response,
				...(fixture.binds ? { binds: fixture.binds } : {}),
				...(fixture.sets ? { sets: fixture.sets } : {}),
			};
			list[at] = next;
			this.replay.replaceFixture(fixture, next);
			writeJson(file, list);
			this.persist();
			return;
		}
	}

	/** Stores a webhook the sandbox delivered as the template `key`; the signature is not kept. */
	recordWebhook(
		key: string,
		rawBody: string,
		vars: Record<string, string | number>,
	): void {
		for (const [file, list] of this.webhookFiles) {
			const at = list.findIndex((t) => t.key === key);
			if (at < 0) continue;
			const env = Object.fromEntries(
				Object.entries(vars).map(([k, v]) => [k, String(v)]),
			);
			const parsed: unknown = JSON.parse(rawBody);
			const body = tokenise(
				scrub(parsed, this.options.secrets ?? []),
				(list[at] as WebhookTemplateFile).body,
				env,
				Object.keys(env),
				[],
			);
			list[at] = { key, body };
			writeJson(file, list);
			this.persist();
			return;
		}
		throw new Error(`no webhook template ${key} to record into`);
	}

	summary(): RecordSummary {
		const open = this.openTags();
		const order = (a: string, b: string) =>
			Number(a.slice(1)) - Number(b.slice(1));
		return {
			cleared: [...this.before].filter((t) => !open.has(t)).sort(order),
			stillAssumed: [...open].sort(order),
			verified: [...new Set([...this.priorVerified, ...this.before])]
				.filter((t) => !open.has(t))
				.sort(order),
		};
	}

	private persist(): void {
		mkdirSync(join(this.manifestFile, ".."), { recursive: true });
		writeJson(this.manifestFile, { verified: this.summary().verified });
	}
}

export function readVerified(
	file: string = join(FIXTURE_DIR, "manifest", "verified.json"),
): string[] {
	try {
		const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
		const list = isObject(parsed) ? parsed.verified : undefined;
		return Array.isArray(list)
			? list.filter((t): t is string => typeof t === "string")
			: [];
	} catch {
		return [];
	}
}
