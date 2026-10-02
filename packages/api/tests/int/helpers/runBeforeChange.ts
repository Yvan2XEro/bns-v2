import type { CollectionConfig } from "payload";

type HookArgs = Record<string, unknown>;
type BeforeChangeHook = (args: HookArgs) => Promise<Record<string, unknown>>;

/**
 * Runs a collection's first `beforeChange` hook directly, the way every spec
 * in this suite drives a hook without booting a real Payload instance.
 * Shared here because `messages-system.int.spec.ts` and
 * `conversations-collection.int.spec.ts` both need the exact same one-liner.
 */
export function runBeforeChange(
	collection: CollectionConfig,
	args: HookArgs,
): Promise<Record<string, unknown>> {
	const hook = collection.hooks?.beforeChange?.[0] as
		| BeforeChangeHook
		| undefined;
	if (!hook) {
		throw new Error(`${String(collection.slug)} has no beforeChange hook`);
	}
	return hook(args);
}
