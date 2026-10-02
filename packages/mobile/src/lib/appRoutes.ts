/**
 * expo-router's file-to-route rules, reproduced as pure functions so a test
 * can prove that a screen is registered and that a link lands on a file.
 * The router's own matcher imports React Native and cannot run under
 * `bun test` or vitest; these rules are the subset this app uses: groups,
 * `index`, `[param]` segments and nested `_layout` files.
 */

const SCREEN_FILE = /\.(tsx|ts|jsx|js)$/;

/** `purchases/[id].tsx` -> `purchases/[id]`, the name a `Stack.Screen` takes. */
export function routeNameOf(file: string): string {
	return file.replace(SCREEN_FILE, "");
}

export function isScreenFile(file: string): boolean {
	if (!SCREEN_FILE.test(file) || file.includes(".test.")) return false;
	const base = file.split("/").pop() ?? "";
	return !base.startsWith("_") && !base.startsWith("+");
}

/**
 * The root `Stack.Screen` a screen file needs. A directory with its own
 * `_layout` is one entry in the root stack (its layout owns the steps), so
 * every file under it answers to the directory's name.
 */
export function rootRegistrationFor(
	file: string,
	layoutDirs: readonly string[],
): string {
	const segments = routeNameOf(file).split("/");
	for (let depth = 1; depth < segments.length; depth++) {
		const dir = segments.slice(0, depth).join("/");
		if (layoutDirs.includes(dir)) return dir;
	}
	return segments.join("/");
}

/** Every `<Stack.Screen name="…">` in a layout's source. */
export function stackScreenNames(layoutSource: string): string[] {
	return [...layoutSource.matchAll(/<Stack\.Screen\s+name="([^"]+)"/g)].map(
		(match) => match[1] as string,
	);
}

function urlSegments(routeName: string): string[] {
	return routeName
		.split("/")
		.filter((segment) => !/^\(.*\)$/.test(segment))
		.filter(
			(segment, index, all) =>
				!(segment === "index" && index === all.length - 1),
		);
}

/**
 * The route name a path resolves to, or null. A static segment outranks a
 * dynamic one at the same position, as in expo-router.
 */
export function matchRoute(
	path: string,
	routeNames: readonly string[],
): string | null {
	const pathname = path.split(/[?#]/)[0] ?? "";
	const parts = pathname.split("/").filter(Boolean);
	let best: { name: string; score: number } | null = null;
	for (const name of routeNames) {
		const segments = urlSegments(name);
		if (segments.length !== parts.length) continue;
		let score = 0;
		let matches = true;
		for (const [index, segment] of segments.entries()) {
			if (/^\[[^.\]]+\]$/.test(segment)) continue;
			if (segment !== parts[index]) {
				matches = false;
				break;
			}
			score += 1;
		}
		if (matches && (!best || score > best.score)) best = { name, score };
	}
	return best?.name ?? null;
}
