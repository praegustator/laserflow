import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { Job } from '../types/index.js';

export class JobRepository {
  private dataDir: string;
  private filePath: string;
  private jobs: Map<string, Job> = new Map();

  constructor(dataDir = join(process.cwd(), 'data')) {
    this.dataDir = dataDir;
    this.filePath = join(dataDir, 'jobs.json');
    this.ensureDir();
    this.load();
  }

  private ensureDir(): void {
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
  }

  private load(): void {
    if (!existsSync(this.filePath)) return;
    try {
      const content = readFileSync(this.filePath, 'utf-8');
      const arr: Job[] = JSON.parse(content);
      this.jobs = new Map(arr.map((j) => [j.id, j]));
    } catch {
      this.jobs = new Map();
    }
  }

  private persist(): void {
    const arr = Array.from(this.jobs.values());
    writeFileSync(this.filePath, JSON.stringify(arr, null, 2), 'utf-8');
  }

  findAll(): Job[] {
    return Array.from(this.jobs.values());
  }

  findById(id: string): Job | null {
    return this.jobs.get(id) ?? null;
  }

  save(job: Job): void {
    this.jobs.set(job.id, job);
    this.persist();
  }

  delete(id: string): void {
    this.jobs.delete(id);
    this.persist();
  }
}

/** Shared singleton instance used by all route handlers and the server. */
export const jobRepo = new JobRepository();
