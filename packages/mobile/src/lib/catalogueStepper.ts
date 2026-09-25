/**
 * Pure state machine behind the catalogue's quick stock stepper.
 *
 * Every tap must move inventory, but firing one stock-movement request per
 * tap invites two failures: a burst of taps racing across several in-flight
 * requests, and a displayed total that drifts from whatever the server
 * actually accepted. This machine coalesces taps into a single pending delta
 * per row; the screen debounces `queue` calls and sends one movement for the
 * accumulated delta, so at most one write is ever in flight for a given row.
 */

export interface RowStepState {
	/** Net delta not yet confirmed by the server. */
	pending: number;
	/** A stock-movement request for this row is in flight. */
	committing: boolean;
}

export type StepState = Record<string, RowStepState>;

export type StepAction =
	| { type: "queue"; rowId: string; delta: number }
	| { type: "start"; rowId: string }
	| { type: "settle"; rowId: string; appliedDelta: number }
	| { type: "fail"; rowId: string };

export function stepReducer(state: StepState, action: StepAction): StepState {
	switch (action.type) {
		case "queue": {
			const entry = state[action.rowId] ?? { pending: 0, committing: false };
			return {
				...state,
				[action.rowId]: { ...entry, pending: entry.pending + action.delta },
			};
		}
		case "start": {
			const entry = state[action.rowId];
			if (!entry) return state;
			return { ...state, [action.rowId]: { ...entry, committing: true } };
		}
		case "settle": {
			const entry = state[action.rowId];
			if (!entry) return state;
			const pending = entry.pending - action.appliedDelta;
			if (pending === 0) {
				const rest = { ...state };
				delete rest[action.rowId];
				return rest;
			}
			return { ...state, [action.rowId]: { pending, committing: false } };
		}
		// A refusal is never retried: drop whatever was queued for this row,
		// including taps that arrived while the request was in flight, so the
		// row falls back to the server's own number instead of an unconfirmed
		// one.
		case "fail": {
			if (!(action.rowId in state)) return state;
			const rest = { ...state };
			delete rest[action.rowId];
			return rest;
		}
		default:
			return state;
	}
}

/**
 * A row is "owed" a write once it carries a pending delta and no request is
 * currently carrying it — either because its debounce window hasn't fired
 * yet, or because it settled with a remainder (a tap landed while the
 * previous request for it was in flight). Two callers rely on this exact
 * definition: the screen re-flushes immediately after a commit settles when
 * this is true, and a teardown (unmount, app backgrounding) flushes every
 * row this is true for, since a debounce timer may never get the chance to
 * fire on its own.
 */
export function needsFlush(state: StepState, rowId: string): boolean {
	const entry = state[rowId];
	return Boolean(entry) && entry.pending !== 0 && !entry.committing;
}

/** Every row a teardown must flush immediately. See `needsFlush`. */
export function rowsNeedingFlush(state: StepState): string[] {
	return Object.keys(state).filter((rowId) => needsFlush(state, rowId));
}
