import { type Mock, mock } from "bun:test";

/**
 * The shape chat-service's HTTP calls actually need: a function from
 * (url, init) to a Response. `typeof fetch` also carries Bun's `preconnect`
 * static, which a plain mock function does not have — attaching the real
 * one (never invoked by this code) is what makes the mock structurally a
 * `typeof fetch`, so tests assign it without a cast that would otherwise be
 * silencing a genuine shape mismatch. The return type keeps the `Mock`
 * instance methods (`toHaveBeenCalled`, `mockClear`, ...) alongside it, so
 * assertions on the mock still type-check.
 */
type FetchImpl = (
	input: string | URL | Request,
	init?: RequestInit,
) => Promise<Response>;

export function mockFetch(impl: FetchImpl): typeof fetch & Mock<FetchImpl> {
	return Object.assign(mock(impl), { preconnect: fetch.preconnect });
}
