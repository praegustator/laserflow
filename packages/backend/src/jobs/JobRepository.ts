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
    return Array.from(this.jobs.values()).filter(j => !j.deletedAt);
  }

  findAllDeleted(): Job[] {
    return Array.from(this.jobs.values()).filter(j => !!j.deletedAt);
  }

  findById(id: string): Job | null {
    return this.jobs.get(id) ?? null;
  }

  save(job: Job): void {
    this.jobs.set(job.id, job);
    this.persist();
  }

  /** Soft-delete: set deletedAt instead of removing. */
  delete(id: string): void {
    const job = this.jobs.get(id);
    if (job) {
      job.deletedAt = new Date().toISOString();
      this.persist();
    }
  }

  /** Permanently remove from storage. */
  purge(id: string): void {
    this.jobs.delete(id);
    this.persist();
  }

  /** Permanently remove all soft-deleted jobs older than `days` days. */
  purgeOlderThan(days: number): number {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    let count = 0;
    for (const [id, job] of this.jobs) {
      if (job.deletedAt && new Date(job.deletedAt).getTime() < cutoff) {
        this.jobs.delete(id);
        count++;
      }
    }
    if (count > 0) this.persist();
    return count;
  }

  /** Restore a soft-deleted job. */
  restore(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job || !job.deletedAt) return false;
    delete job.deletedAt;
    this.persist();
    return true;
  }
}

/** Shared singleton instance used by all route handlers and the server. */
export const jobRepo = new JobRepository();
