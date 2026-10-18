export async function sendOtpEmail(
  email: string,
  code: string,
): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.AUTH_FROM_EMAIL?.trim() ?? "Voice Bridge <onboarding@resend.dev>";

  if (!apiKey) {
    console.log(`[auth] OTP for ${email}: ${code} (RESEND_API_KEY not set)`);
    return { sent: false, reason: "email_not_configured" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Your Voice Bridge sign-in code",
      text: `Your sign-in code is ${code}. It expires in 10 minutes.`,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error("[auth] Resend error:", response.status, body);
    return { sent: false, reason: "email_send_failed" };
  }

  return { sent: true };
}
