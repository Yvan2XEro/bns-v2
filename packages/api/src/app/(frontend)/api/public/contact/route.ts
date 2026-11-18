import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { triggerNotificationEvent } from "../../../../../hooks/notificationEvents";

export async function POST(request: Request) {
	try {
		const body = await request.json();
		const { name, email, subject, message } = body;

		if (!name || !email || !subject || !message) {
			return errorResponse(ERROR_CODES.contactIncomplete, 400);
		}

		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(email)) {
			return errorResponse(ERROR_CODES.invalidEmail, 400);
		}

		await triggerNotificationEvent({
			event: "contact-form",
			subscriberId: "admin",
			payload: { name, email, subject, message },
		});

		return Response.json({
			success: true,
			message: "Message sent successfully",
		});
	} catch (error) {
		console.error("Contact form error:", error);
		return errorResponse(ERROR_CODES.server, 500);
	}
}
