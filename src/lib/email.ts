type EmailPayload = {
  to: string;
  subject: string;
  text: string;
};

/**
 * Send an email via Resend if configured, otherwise log to console.
 * Never throws — failures are logged and swallowed.
 */
export async function sendEmail(payload: EmailPayload): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "ProofFlow <notifications@proofflow.dev>";

  if (!apiKey) {
    console.log(`[email] (dev) To: ${payload.to}`);
    console.log(`[email] (dev) Subject: ${payload.subject}`);
    console.log(`[email] (dev) Body:\n${payload.text}`);
    return true;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [payload.to],
        subject: payload.subject,
        text: payload.text,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[email] Resend error ${res.status}: ${body}`);
      return false;
    }

    console.log(`[email] Sent to ${payload.to}: ${payload.subject}`);
    return true;
  } catch (e) {
    console.error("[email] Failed to send:", e instanceof Error ? e.message : e);
    return false;
  }
}
