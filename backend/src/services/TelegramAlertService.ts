import axios from 'axios';

export type AlertSeverity = 'info' | 'warning' | 'critical';

type SendParams = {
  enabled: boolean;
  botToken: string;
  userId: string;
  minSeverity: AlertSeverity;
  rateLimitSec: number;
  severity: AlertSeverity;
  title: string;
  lines: string[];
  dedupeKey: string;
  parseMode?: 'Markdown' | 'HTML';
};

export class TelegramAlertService {
  private lastSentByKey = new Map<string, number>();
  private severityRank: Record<AlertSeverity, number> = { info: 1, warning: 2, critical: 3 };

  async send(params: SendParams): Promise<{ sent: boolean; reason?: string }> {
    if (!params.enabled) return { sent: false, reason: 'telegram_disabled' };
    if (!params.botToken || !params.userId) return { sent: false, reason: 'telegram_not_configured' };
    if (this.severityRank[params.severity] < this.severityRank[params.minSeverity]) {
      return { sent: false, reason: 'below_min_severity' };
    }

    const now = Date.now();
    const last = this.lastSentByKey.get(params.dedupeKey) || 0;
    const minGapMs = Math.max(5, params.rateLimitSec || 120) * 1000;
    if (now - last < minGapMs) {
      return { sent: false, reason: 'rate_limited' };
    }

    const text = [
      `HELIX.ONE ${params.title}`,
      ...params.lines,
      `Time: ${new Date().toISOString()}`,
    ].join('\n');

    const url = `https://api.telegram.org/bot${params.botToken}/sendMessage`;
    await axios.post(url, {
      chat_id: params.userId,
      text,
      disable_web_page_preview: true,
      ...(params.parseMode ? { parse_mode: params.parseMode } : {}),
    }, { timeout: 10000 });

    this.lastSentByKey.set(params.dedupeKey, now);
    return { sent: true };
  }
}
