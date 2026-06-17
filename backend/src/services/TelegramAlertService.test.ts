import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { TelegramAlertService } from './TelegramAlertService';

vi.mock('axios');

describe('TelegramAlertService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('does not send when disabled', async () => {
    const svc = new TelegramAlertService();
    const res = await svc.send({
      enabled: false,
      botToken: 'x',
      userId: 'y',
      minSeverity: 'info',
      rateLimitSec: 10,
      severity: 'critical',
      title: 'Test',
      lines: ['hello'],
      dedupeKey: 'k1',
    });
    expect(res.sent).toBe(false);
    expect((axios.post as any)).not.toHaveBeenCalled();
  });

  it('rate limits duplicate sends by dedupe key', async () => {
    const svc = new TelegramAlertService();
    (axios.post as any).mockResolvedValue({ data: { ok: true } });

    const first = await svc.send({
      enabled: true,
      botToken: 'x',
      userId: 'y',
      minSeverity: 'info',
      rateLimitSec: 3600,
      severity: 'critical',
      title: 'Test',
      lines: ['hello'],
      dedupeKey: 'same',
    });
    const second = await svc.send({
      enabled: true,
      botToken: 'x',
      userId: 'y',
      minSeverity: 'info',
      rateLimitSec: 3600,
      severity: 'critical',
      title: 'Test',
      lines: ['hello'],
      dedupeKey: 'same',
    });

    expect(first.sent).toBe(true);
    expect(second.sent).toBe(false);
    expect(second.reason).toBe('rate_limited');
    expect((axios.post as any)).toHaveBeenCalledTimes(1);
  });
});
