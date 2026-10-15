import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { type PdfLine, renderTextPdf } from "../lib/textPdf";

export type TextPdfDocument = readonly PdfLine[];

export const NOTCHPAY_TAGS = Array.from({ length: 16 }, (_, i) => `A${i + 1}`);

const DEFAULT_BASE_URL = "https://api.notchpay.co";
const DEFAULT_FIXTURES = resolve(
	import.meta.dirname,
	"../../tests/int/fixtures/notchpay",
);

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

const tagNumber = (tag: string) => Number(tag.slice(1));

/** Every `assumed` tag carried by a fixture or a webhook template. */
function openTags(fixturesDir: string): Set<string> {
	const open = new Set<string>();
	for (const dir of [fixturesDir, join(fixturesDir, "webhooks")]) {
		if (!existsSync(dir)) continue;
		for (const name of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
			const parsed: unknown = JSON.parse(readFileSync(join(dir, name), "utf8"));
			for (const entry of Array.isArray(parsed) ? parsed : [parsed])
				if (isObject(entry) && Array.isArray(entry.assumed))
					for (const tag of entry.assumed)
						if (typeof tag === "string") open.add(tag);
		}
	}
	return open;
}

function verifiedTags(fixturesDir: string): Set<string> {
	const file = join(fixturesDir, "manifest", "verified.json");
	if (!existsSync(file)) return new Set();
	const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
	const list = isObject(parsed) ? parsed.verified : undefined;
	return new Set(
		Array.isArray(list)
			? list.filter((t): t is string => typeof t === "string")
			: [],
	);
}

interface ContractRun {
	passed: number;
	failed: string[];
	skipped: string[];
	files: string[];
}

function contractRun(vitestJsonPath: string): ContractRun {
	const parsed: unknown = JSON.parse(readFileSync(vitestJsonPath, "utf8"));
	const files =
		isObject(parsed) && Array.isArray(parsed.testResults)
			? parsed.testResults
			: [];
	const run: ContractRun = { passed: 0, failed: [], skipped: [], files: [] };
	for (const file of files) {
		if (isObject(file) && typeof file.name === "string")
			run.files.push(file.name);
		const results =
			isObject(file) && Array.isArray(file.assertionResults)
				? file.assertionResults
				: [];
		for (const result of results) {
			if (!isObject(result)) continue;
			const name = String(result.fullName ?? result.title ?? "unnamed test");
			if (result.status === "passed") run.passed += 1;
			else if (result.status === "failed") run.failed.push(name);
			else run.skipped.push(name);
		}
	}
	return run;
}

const names = (list: string[]) => list.slice(0, 5).join("; ");

export interface EvidenceInput {
	fixturesDir: string;
	vitestJsonPath: string;
	now: Date;
	env?: Readonly<Record<string, string | undefined>>;
}

/** A G5 document exists only for a complete, genuine record run: otherwise `refusal` says why. */
export function buildNotchpayEvidence({
	fixturesDir,
	vitestJsonPath,
	now,
	env = process.env,
}: EvidenceInput): { refusal: string | null; document?: TextPdfDocument } {
	const open = openTags(fixturesDir);
	const verified = verifiedTags(fixturesDir);
	const stillAssumed = NOTCHPAY_TAGS.filter(
		(tag) => open.has(tag) || !verified.has(tag),
	).sort((a, b) => tagNumber(a) - tagNumber(b));
	const run = contractRun(vitestJsonPath);

	const reasons: string[] = [];
	if (stillAssumed.length > 0)
		reasons.push(
			`assumption tags still unverified: ${stillAssumed.join(", ")}`,
		);
	if (run.failed.length > 0)
		reasons.push(`failed contract tests: ${names(run.failed)}`);
	if (run.skipped.length > 0)
		reasons.push(`skipped contract tests: ${names(run.skipped)}`);
	if (run.passed === 0) reasons.push("the contract run has no passing test");
	if (!run.files.some((f) => f.includes("notchpay-marketplace-contract")))
		reasons.push(
			"the vitest JSON does not come from notchpay-marketplace-contract.int.spec.ts",
		);
	if (reasons.length > 0)
		return { refusal: `No G5 document: ${reasons.join(". ")}.` };

	const key = env.NOTCHPAY_PUBLIC_KEY ?? "";
	const lines: PdfLine[] = [
		{ text: "NotchPay sandbox evidence (gate G5)", bold: true, size: 16 },
		{ text: `Run date: ${now.toISOString()}`, gap: 8 },
		{ text: `Sandbox base URL: ${env.NOTCHPAY_BASE_URL || DEFAULT_BASE_URL}` },
		{ text: `Key id: ...${key.slice(-4)}` },
		{
			text: `Contract suite: ${run.passed} passed, 0 failed, 0 skipped`,
		},
		{ text: "Assumption ledger", bold: true, gap: 8 },
		...NOTCHPAY_TAGS.map((tag) => ({ text: `${tag}  cleared` })),
	];
	return { refusal: null, document: lines };
}

if (import.meta.main) {
	const [vitestJsonPath, out = "notchpay-sandbox-evidence.pdf"] =
		process.argv.slice(2);
	if (!vitestJsonPath) {
		console.error(
			"usage: bun src/scripts/packNotchpayEvidence.ts <vitest-json> [out.pdf]",
		);
		process.exit(1);
	}
	const { refusal, document } = buildNotchpayEvidence({
		fixturesDir: DEFAULT_FIXTURES,
		vitestJsonPath,
		now: new Date(),
	});
	if (refusal || !document) {
		console.error(refusal);
		process.exit(1);
	}
	writeFileSync(out, renderTextPdf(document));
	console.log(`wrote ${out}`);
}
