import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A setting both sides of a seam must agree on — chat-service's own address,
 * which the API uses to let that one caller name a message's sender — was
 * wired to chat-service and never to the api container. The API's check
 * fails closed, so every websocket message was refused as "not a
 * participant", and no local gate saw it: tests set the variable themselves.
 *
 * The class: a variable the API reads that a compose file hands to another
 * service but not to `api`. Compose files are read as text — each service
 * block is the run of lines under a two-space `name:` header.
 */

const REPO = path.resolve(__dirname, "../../../..");
const API_SRC = path.resolve(__dirname, "../../src");
// Each container's own listen port: the same name on purpose, never a value
// two services must agree on.
const PER_CONTAINER = new Set(["PORT"]);

const COMPOSE_FILES = [
	"docker-compose.yml",
	"docker-compose.atlas.yml",
	"docker-compose.local.yml",
];

function walk(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const full = path.join(dir, name);
		if (statSync(full).isDirectory()) walk(full, out);
		else if (/\.(ts|tsx)$/.test(name)) out.push(full);
	}
	return out;
}

function envReadByApi(): Set<string> {
	const names = new Set<string>();
	for (const file of walk(API_SRC)) {
		for (const m of readFileSync(file, "utf8").matchAll(
			/process\.env\.([A-Z][A-Z0-9_]*)/g,
		)) {
			names.add(m[1]);
		}
	}
	return names;
}

function envByService(text: string): Map<string, Set<string>> {
	const services = new Map<string, Set<string>>();
	let inServices = false;
	let current: Set<string> | null = null;
	for (const line of text.split("\n")) {
		if (/^\S/.test(line)) {
			inServices = line.startsWith("services:");
			current = null;
			continue;
		}
		if (!inServices) continue;
		const header = line.match(/^ {2}([a-z][a-z0-9_-]*):\s*$/);
		if (header) {
			current = new Set();
			services.set(header[1], current);
			continue;
		}
		const key = line.match(/^ {6}([A-Z][A-Z0-9_]*):/);
		if (current && key) current.add(key[1]);
	}
	return services;
}

describe("a variable the API reads is wired to the api container", () => {
	const apiReads = envReadByApi();

	for (const file of COMPOSE_FILES) {
		it(`${file}: nothing the API reads is handed only to another service`, () => {
			const services = envByService(
				readFileSync(path.join(REPO, file), "utf8"),
			);
			const api = services.get("api");
			expect(api, `${file} has no api service`).toBeDefined();
			const missing = new Set<string>();
			for (const [name, env] of services) {
				if (name === "api") continue;
				for (const variable of env) {
					if (
						apiReads.has(variable) &&
						!PER_CONTAINER.has(variable) &&
						!api?.has(variable)
					) {
						missing.add(`${variable} (given to ${name})`);
					}
				}
			}
			expect([...missing].sort()).toEqual([]);
		});
	}

	it("the parser sees the seam this guard exists for", () => {
		const services = envByService(
			readFileSync(path.join(REPO, "docker-compose.yml"), "utf8"),
		);
		expect(apiReads.has("CHAT_SERVICE_EMAIL")).toBe(true);
		expect(services.get("chat-service")?.has("CHAT_SERVICE_EMAIL")).toBe(true);
		expect(services.get("api")?.size ?? 0).toBeGreaterThan(10);
	});
});
