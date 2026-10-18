import { describe, expect, test } from "bun:test";
import { appEnvFor } from "./app-env";
import { parseEnv, planStackConfig } from "./env-plan";

const base = [
	"WEB_DOMAIN=buynsellem.com",
	"MONGO_PASSWORD=m",
	"REDIS_PASSWORD=r",
	"MEILI_MASTER_KEY=k",
	"PAYLOAD_SECRET=p",
	"CHAT_SERVICE_PASSWORD=c",
	"STORAGE_PROVIDER=s3",
].join("\n");

const plan = (extra = "") => {
	const { values, duplicates } = parseEnv(`${base}\n${extra}`);
	return planStackConfig(values, duplicates);
};

describe("parseEnv", () => {
	test("reads quotes, export, comments and multi-line values", () => {
		const { values } = parseEnv(
			[
				"# comment",
				"export A=1",
				"B='lit $x'",
				'C="line\\nnext"',
				'D="-----BEGIN',
				"body",
				'-----END"',
				"E=plain # trailing",
				"F=",
			].join("\n"),
		);
		expect(values.get("A")).toBe("1");
		expect(values.get("B")).toBe("lit $x");
		expect(values.get("C")).toBe("line\nnext");
		expect(values.get("D")).toBe("-----BEGIN\nbody\n-----END");
		expect(values.get("E")).toBe("plain");
		expect(values.get("F")).toBe("");
	});
});

describe("planStackConfig", () => {
	test("a complete file passes and splits plain from secret", () => {
		const result = plan("SENTRY_DSN=https://x@y/1\nS3_SECRET_ACCESS_KEY=s");
		expect(result.errors).toEqual([]);
		expect(result.plain.SENTRY_DSN).toBe("https://x@y/1");
		expect(result.secret.S3_SECRET_ACCESS_KEY).toBe("s");
		expect(result.secret.MONGO_PASSWORD).toBe("m");
		expect(result.stackKeys.domain).toEqual({
			value: "buynsellem.com",
			secret: false,
		});
	});

	test("refuses a name the catalog does not know, so nothing is lost", () => {
		expect(plan("NEW_FEATURE_KEY=1").errors.join()).toContain(
			"NEW_FEATURE_KEY is not in infra/src/app-env.ts",
		);
	});

	test("refuses missing required values, duplicates, odd hosts and local uploads", () => {
		const { values, duplicates } = parseEnv(
			"WEB_DOMAIN=a.com\nWEB_DOMAIN=b.com\nAPI_DOMAIN=api.other.com\nSTORAGE_PROVIDER=local",
		);
		const errors = planStackConfig(values, duplicates).errors.join("\n");
		expect(errors).toContain("WEB_DOMAIN is set more than once");
		expect(errors).toContain("MONGO_PASSWORD is required");
		expect(errors).toContain("API_DOMAIN=api.other.com");
		expect(errors).toContain("STORAGE_PROVIDER=local");
	});

	test("leaves derived and Compose-only names out, saying so", () => {
		const result = plan(
			"DATABASE_URI=mongodb://dokploy\nMONGO_EXPRESS_USER=x\nAPI_DOMAIN=api.buynsellem.com",
		);
		expect(result.errors).toEqual([]);
		expect(result.plain.DATABASE_URI).toBeUndefined();
		expect(result.plain.API_DOMAIN).toBeUndefined();
		expect(result.notes.join()).toContain("DATABASE_URI ignored");
	});
});

describe("appEnvFor", () => {
	test("gives each service only its variables", () => {
		const web = appEnvFor("web").map((e) => e.name);
		expect(web).toContain("NOVU_APPLICATION_IDENTIFIER");
		expect(web).not.toContain("PAYLOAD_SECRET");
		expect(appEnvFor("chat").map((e) => e.name)).toEqual([
			"CHAT_SERVICE_EMAIL",
			"CHAT_SERVICE_PASSWORD",
		]);
	});
});
