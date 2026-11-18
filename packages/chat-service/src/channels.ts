/**
 * The Redis pub/sub channel names this service subscribes to, declared once
 * here rather than in each subscriber module. `membership.ts` shipped
 * `chat:membership` as its own local literal (P3 review M12): a rename on
 * one side left the other unchanged and eviction broke with both packages
 * type-clean. `chat-channel-parity.int.spec.ts` (API side) checks these
 * against their counterparts in `hooks/membershipEvents.ts` and
 * `hooks/systemMessageEvents.ts`.
 */
export const CHAT_MEMBERSHIP_CHANNEL = "chat:membership";
export const CHAT_SYSTEM_CHANNEL = "chat:system";
