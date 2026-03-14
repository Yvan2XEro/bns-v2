import { triggerNovuEvent } from "../../../../../hooks/novuEvents";

export async function POST(request: Request) {
	try {
		const body = await request.json();
		const { name, email, subject, message } = body;

		if (!name || !email || !subject || !message) {
			return Response.json(
				{ error: "All fields are required: name, email, subject, message" },
				{ status: 400 },
			);
		}

		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(email)) {
			return Response.json({ error: "Invalid email address" }, { status: 400 });
		}

		await triggerNovuEvent({
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
		return Response.json({ error: "Failed to send message" }, { status: 500 });
	}
}
