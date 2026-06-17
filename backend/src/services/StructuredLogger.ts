import fs from 'fs';
import path from 'path';

export type LogLevel = 'info' | 'warn' | 'error';

export class StructuredLogger {
  private logDir: string;
  private logPath: string;
  private maxBytes: number;
  private keepFiles: number;

  constructor(name: string, maxBytes = 2 * 1024 * 1024, keepFiles = 5) {
    this.logDir = path.resolve(process.cwd(), 'logs');
    this.logPath = path.join(this.logDir, `${name}.log`);
    this.maxBytes = maxBytes;
    this.keepFiles = keepFiles;
    fs.mkdirSync(this.logDir, { recursive: true });
  }

  info(event: string, data: Record<string, unknown> = {}) {
    this.write('info', event, data);
  }

  warn(event: string, data: Record<string, unknown> = {}) {
    this.write('warn', event, data);
  }

  error(event: string, data: Record<string, unknown> = {}) {
    this.write('error', event, data);
  }

  private write(level: LogLevel, event: string, data: Record<string, unknown>) {
    this.rotateIfNeeded();
    const entry = {
      ts: new Date().toISOString(),
      level,
      event,
      ...data,
    };
    fs.appendFileSync(this.logPath, `${JSON.stringify(entry)}\n`, 'utf8');
  }

  private rotateIfNeeded() {
    if (!fs.existsSync(this.logPath)) return;
    const stat = fs.statSync(this.logPath);
    if (stat.size < this.maxBytes) return;

    for (let i = this.keepFiles - 1; i >= 1; i -= 1) {
      const src = `${this.logPath}.${i}`;
      const dst = `${this.logPath}.${i + 1}`;
      if (fs.existsSync(src)) {
        if (i + 1 > this.keepFiles) fs.rmSync(src, { force: true });
        else fs.renameSync(src, dst);
      }
    }

    fs.renameSync(this.logPath, `${this.logPath}.1`);
  }
}
