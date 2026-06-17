import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SettingsStore } from './SettingsStore';

let tempDir: string;
let prevCwd: string;

describe('SettingsStore', () => {
  beforeEach(() => {
    prevCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helix-settings-'));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(prevCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('hydrates defaults including maxOpenPositions and leverage floor', () => {
    const store = new SettingsStore();
    const settings = store.get();

    expect(settings.riskSettings.minLeverage).toBe(10);
    expect(settings.riskSettings.maxLeverage).toBe(20);
    expect((settings.riskSettings as any).maxOpenPositions).toBe(4);
    expect(settings.riskSettings.paperTrading).toBe(true);
  });

  it('persists and reloads updated risk settings', () => {
    const store = new SettingsStore();
    const settings = store.get();
    settings.riskSettings.minLeverage = 12;
    settings.riskSettings.maxLeverage = 25;
    (settings.riskSettings as any).maxOpenPositions = 6;
    settings.riskSettings.minConfidence = 0.65;
    settings.riskSettings.paperTrading = false;
    settings.riskSettings.deepseekDecisionEnabled = false;

    store.set(settings);

    const reloaded = new SettingsStore().get();
    expect(reloaded.riskSettings.minLeverage).toBe(12);
    expect(reloaded.riskSettings.maxLeverage).toBe(25);
    expect((reloaded.riskSettings as any).maxOpenPositions).toBe(6);
    expect(reloaded.riskSettings.minConfidence).toBe(0.65);
    expect(reloaded.riskSettings.paperTrading).toBe(false);
    expect(reloaded.riskSettings.deepseekDecisionEnabled).toBe(false);
  });
});
