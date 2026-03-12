// Stub module declaration so that payload-types.ts `declare module 'payload'`
// augmentation does not error — the web package doesn't install payload directly.
declare module "payload" {
	export interface GeneratedTypes {}
}
