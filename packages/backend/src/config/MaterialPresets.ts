import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { MaterialPreset } from '../types/index.js';

const DEFAULT_PRESETS: MaterialPreset[] = [
  {
    id: 'wood-3mm',
    name: 'Wood 3mm',
    thickness: 3,
    engrave: { feedRate: 3000, power: 30 },
    cutThin: { feedRate: 600, power: 80 },
    cutThick: { feedRate: 300, power: 100 },
  },
  {
    id: 'acrylic-3mm',
    name: 'Acrylic 3mm',
    thickness: 3,
    engrave: { feedRate: 2000, power: 25 },
    cutThin: { feedRate: 400, power: 90 },
    cutThick: { feedRate: 200, power: 100 },
  },
  {
    id: 'cardboard-3mm',
    name: 'Cardboard 3mm',
    thickness: 3,
    engrave: { feedRate: 4000, power: 20 },
    cutThin: { feedRate: 800, power: 60 },
    cutThick: { feedRate: 500, power: 80 },
  },
];

export class MaterialPresets {
  private filePath: string;
  private presets: Map<string, MaterialPreset> = new Map();

  constructor(dataDir = join(process.cwd(), 'data')) {
    this.filePath = join(dataDir, 'material-presets.json');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    this.load();
    if (this.presets.size === 0) {
      for (const p of DEFAULT_PRESETS) {
        this.presets.set(p.id, p);
      }
      this.persist();
    }
  }

  private load(): void {
    if (!existsSync(this.filePath)) return;
    try {
      const arr: MaterialPreset[] = JSON.parse(readFileSync(this.filePath, 'utf-8'));
      this.presets = new Map(arr.map((p) => [p.id, p]));
    } catch {
      this.presets = new Map();
    }
  }

  private persist(): void {
    writeFileSync(this.filePath, JSON.stringify(Array.from(this.presets.values()), null, 2));
  }

  getAll(): MaterialPreset[] {
    return Array.from(this.presets.values());
  }

  save(preset: MaterialPreset): void {
    this.presets.set(preset.id, preset);
    this.persist();
  }

  delete(id: string): void {
    this.presets.delete(id);
    this.persist();
  }
}

export const materialPresets = new MaterialPresets();
