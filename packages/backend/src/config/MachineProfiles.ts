import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { MachineProfile } from '../types/index.js';

const DEFAULT_PROFILE: MachineProfile = {
  id: 'default',
  name: 'Generic Diode Laser',
  workArea: { x: 400, y: 400 },
  maxFeedRate: { x: 8000, y: 8000 },
  maxSpindleSpeed: 1000,
  homingEnabled: false,
};

export class MachineProfiles {
  private filePath: string;
  private profiles: Map<string, MachineProfile> = new Map();

  constructor(dataDir = join(process.cwd(), 'data')) {
    this.filePath = join(dataDir, 'machine-profiles.json');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    this.load();
    if (this.profiles.size === 0) {
      this.profiles.set(DEFAULT_PROFILE.id, DEFAULT_PROFILE);
      this.persist();
    }
  }

  private load(): void {
    if (!existsSync(this.filePath)) return;
    try {
      const arr: MachineProfile[] = JSON.parse(readFileSync(this.filePath, 'utf-8'));
      this.profiles = new Map(arr.map((p) => [p.id, p]));
    } catch {
      this.profiles = new Map();
    }
  }

  private persist(): void {
    writeFileSync(this.filePath, JSON.stringify(Array.from(this.profiles.values()), null, 2));
  }

  getAll(): MachineProfile[] {
    return Array.from(this.profiles.values());
  }

  getById(id: string): MachineProfile | undefined {
    return this.profiles.get(id);
  }

  save(profile: MachineProfile): void {
    this.profiles.set(profile.id, profile);
    this.persist();
  }

  delete(id: string): void {
    this.profiles.delete(id);
    this.persist();
  }
}

export const machineProfiles = new MachineProfiles();
