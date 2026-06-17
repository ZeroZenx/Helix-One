import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SettingsAuditService } from './SettingsAuditService';

let tempDir: string;
let prevCwd: string;

describe('SettingsAuditService', () => {
  beforeEach(() => {
    prevCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helix-audit-'));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(prevCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('writes and lists settings audit entries newest first', () => {
    const audit = new SettingsAuditService();
    audit.append({
      ts: '2026-04-15T10:00:00.000Z',
      actor: 'test',
      type: 'settings_saved',
      summary: 'first',
      changes: { a: { before: 1, after: 2 } },
    });
    audit.append({
      ts: '2026-04-15T11:00:00.000Z',
      actor: 'test',
      type: 'settings_saved',
      summary: 'second',
      changes: { b: { before: 2, after: 3 } },
    });

    const rows = audit.list(10) as any[];
    expect(rows).toHaveLength(2);
    expect(rows[0].summary).toBe('second');
    expect(rows[1].summary).toBe('first');
  });
});
