import fs from 'fs';
import path from 'path';

export interface PromotionAuditEntry {
  ts: string;
  type: string;
  [key: string]: any;
}

export class PromotionAuditService {
  private auditPath: string;

  constructor() {
    this.auditPath = path.resolve(process.cwd(), 'data', 'promotion-audit.jsonl');
    fs.mkdirSync(path.dirname(this.auditPath), { recursive: true });
  }

  append(entry: PromotionAuditEntry) {
    const normalized: PromotionAuditEntry = {
      ...entry,
      ts: entry.ts || new Date().toISOString(),
      type: entry.type || 'unknown',
    };
    fs.appendFileSync(this.auditPath, JSON.stringify(normalized) + '\n');
    return normalized;
  }

  list(limit = 30): PromotionAuditEntry[] {
    if (!fs.existsSync(this.auditPath)) return [];
    const lines = fs
      .readFileSync(this.auditPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .slice(-Math.max(1, limit));

    return lines
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .reverse();
  }
}
