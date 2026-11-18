// @vitest-environment node
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appPathFor } from "../../src/contracts/appLinks";
import { WORKFLOWS } from "../../src/scripts/syncNotificationWorkflows";

const PACKAGES = join(__dirname, "../../..");

/** Every file under `dir`, relative to it. */
function filesUnder(dir: string, prefix = ""): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		const rel = prefix ? `${prefix}/${name}` : name;
		return statSync(path).isDirectory() ? filesUnder(path, rel) : [rel];
	});
}

/** A route's segments: groups dropped, `[param]` as a wildcard. */
function routeOf(segments: string[]): string[] {
	return segments
		.filter((segment) => !/^\(.*\)$/.test(segment))
		.map((segment) => (/^\[.+\]$/.test(segment) ? "*" : segment));
}

const webRoutes = filesUnder(join(PACKAGES, "web/src/app"))
	.filter((file) => file.endsWith("/page.tsx") || file === "page.tsx")
	.map((file) => routeOf(file.split("/").slice(0, -1)));

const appRoutes = filesUnder(join(PACKAGES, "mobile/app"))
	.filter((file) => /\.tsx$/.test(file) && !file.includes(".test."))
	.filter((file) => !/^[_+]/.test(file.split("/").pop() ?? ""))
	.map((file) => {
		const segments = file.replace(/\.tsx$/, "").split("/");
		if (segments.at(-1) === "index") segments.pop();
		return routeOf(segments);
	});

function opens(routes: string[][], path: string): boolean {
	const parts = path.split("/").filter(Boolean);
	return routes.some(
		(route) =>
			route.length === parts.length &&
			route.every((segment, i) => segment === "*" || segment === parts[i]),
	);
}

/** Every link a notification's in-app step carries (redirect and actions). */
function inAppLinks(): { workflow: string; url: string }[] {
	const links: { workflow: string; url: string }[] = [];
	const walk = (node: unknown, workflow: string) => {
		if (!node || typeof node !== "object") return;
		for (const [key, value] of Object.entries(node)) {
			if (key === "url" && typeof value === "string" && value.startsWith("/"))
				links.push({ workflow, url: value });
			else walk(value, workflow);
		}
	};
	for (const workflow of WORKFLOWS) walk(workflow.steps, workflow.workflowId);
	return links;
}

/** A link as it opens: its {{payload…}} placeholders filled. */
const filled = (url: string) => url.replace(/\{\{[^}]+\}\}/g, "id-1");

describe("every in-app notification link opens a screen", () => {
	const links = inAppLinks();

	it("finds the workflows' links", () => {
		expect(links.length).toBeGreaterThan(20);
	});

	it.each(links)("$workflow → $url on the website", ({ url }) => {
		const [pathname] = filled(url).split("?");
		expect(opens(webRoutes, pathname ?? "/")).toBe(true);
	});

	it.each(links)("$workflow → $url in the app", ({ url }) => {
		const [pathname, search = ""] = filled(url).split("?");
		const route = appPathFor(pathname ?? "/", search).split("?")[0] ?? "/";
		expect(opens(appRoutes, route)).toBe(true);
	});
});

describe("appPathFor names the app's screen for a seller page", () => {
	it.each([
		["/seller/messages/c-1", "", "/seller/inbox/c-1"],
		["/seller/messages", "?conversation=c-2", "/seller/inbox/c-2"],
		["/seller/catalogue/p-1/stock", "", "/seller/product/p-1"],
		["/seller/disputes/d-1", "", "/disputes/d-1"],
		["/messages", "?conversation=c-3", "/messages/c-3"],
		["/purchases/o-1", "", "/purchases/o-1"],
	])("%s%s → %s", (pathname, search, expected) => {
		expect(appPathFor(pathname, search)).toBe(expected);
	});
});
