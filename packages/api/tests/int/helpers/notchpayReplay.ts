import { readdirSync, readFileSync } from "node:fs";
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

function substitute(value: unknown, env: Record<string, string>): unknown {
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

	private modeHolds(when: string, env: Record<string, string>): boolean {
		const [key = "", expected = ""] = substitute(when, env)
			.toString()
			.split("=");
		return (this.modes.get(key) ?? "initial") === expected;
	}

	transport(): NotchPayTransport {
		return async (request): Promise<WireResponse> => {
			this.journal.push(request);
			const bodyFields = isObject(request.body)
				? Object.fromEntries(
						Object.entries(request.body).filter(
							(entry): entry is [string, string] =>
								typeof entry[1] === "string",
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
				if (fixture.sets) {
					const [key = "", value = ""] = substitute(fixture.sets, env)
						.toString()
						.split("=");
					this.modes.set(key, value);
				}
				return {
					status: fixture.response.status,
					body: substitute(fixture.response.body, env),
				};
			}
			throw new Error(
				`no NotchPay fixture for ${request.method} ${request.path}`,
			);
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
