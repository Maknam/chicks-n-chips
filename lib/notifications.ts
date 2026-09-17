export interface NotificationProvider {
  sendSMS(to: string, message: string): Promise<void>;
  sendWhatsApp(to: string, message: string): Promise<void>;
  sendPush(to: string, message: string): Promise<void>;
}
export class MNotifyProvider implements NotificationProvider {
  async sendSMS(to: string, message: string) {
    if (!process.env.MNOTIFY_API_KEY)
      throw new Error("mNotify credentials not configured");
    const response = await fetch(
      `https://api.mnotify.com/api/sms/quick?key=${encodeURIComponent(process.env.MNOTIFY_API_KEY)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: [to.replace("+", "")],
          sender: process.env.MNOTIFY_SENDER || "ChicsChips",
          message,
          is_schedule: false,
          schedule_date: "",
        }),
        signal: AbortSignal.timeout(10000),
      },
    );
    const result = await response.json();
    if (!response.ok || String(result.code) !== "2000")
      throw new Error("mNotify did not accept the message");
  }
  async sendWhatsApp(_to: string, _message: string) {
    throw new Error("WhatsApp adapter not configured");
  }
  async sendPush(_to: string, _message: string) {
    throw new Error("Push adapter not configured");
  }
}
