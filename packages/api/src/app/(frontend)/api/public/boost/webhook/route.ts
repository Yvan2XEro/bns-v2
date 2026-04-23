// Legacy webhook endpoint — kept for in-flight NotchPay payments created before the
// provider-specific routes were added. New payments use /webhook/notchpay instead.
export { POST } from "./notchpay/route";
