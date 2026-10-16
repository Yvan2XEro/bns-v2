export interface NetworkSnapshot {
	isConnected: boolean | null;
	isInternetReachable?: boolean | null;
}

/**
 * NetInfo answers `null` while it has not probed yet; only an explicit
 * `false` means offline, so a cold start never flashes the banner or pauses
 * queries that would have succeeded.
 */
export function isOnline(state: NetworkSnapshot): boolean {
	return state.isConnected !== false && state.isInternetReachable !== false;
}
