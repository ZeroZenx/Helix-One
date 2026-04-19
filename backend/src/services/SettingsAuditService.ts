import fs from 'fs';
import path from 'path';

export type SettingsAuditEntry = {
  ts: string;
  actor?: string;
  type: 'settings_saved' | 'risk_auto_tightened';
  summary: string;
  changes: Record<string, { before: unknown; after: unknown }>;
};

export class SettingsAuditService {
  private filePath: string;

  constructor() {
    this.filePath = path.resolve(process.cwd(), 'data', 'settings-audit.jsonl');
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
  }

  append(entry: SettingsAuditEntry) {
    fs.appendFileSync(this.filePath, JSON.stringify(entry) + '\n');
    return entry;
  }

  list(limit = 100) {
    if (!fs.existsSync(this.filePath)) return [];
    return fs.readFileSync(this.filePath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .slice(-limit)
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
