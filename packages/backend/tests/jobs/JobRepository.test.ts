import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JobRepository } from '../../src/jobs/JobRepository.js';
import type { Job } from '../../src/types/index.js';
import { rmSync, existsSync } from 'fs';

const TEST_DATA_DIR = '/tmp/laserflow-test-data';

describe('JobRepository', () => {
  let repo: JobRepository;

  beforeEach(() => {
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true });
    }
    repo = new JobRepository(TEST_DATA_DIR);
  });

  afterEach(() => {
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true });
    }
  });

  const makeJob = (id: string): Job => ({
    id,
    name: `Job ${id}`,
    createdAt: new Date().toISOString(),
    status: 'idle',
    geometry: [],
    operations: [],
  });

  it('starts empty', () => {
    expect(repo.findAll()).toHaveLength(0);
  });

  it('saves and retrieves a job', () => {
    const job = makeJob('job-1');
    repo.save(job);
    expect(repo.findAll()).toHaveLength(1);
    expect(repo.findById('job-1')).toMatchObject({ id: 'job-1' });
  });

  it('updates an existing job', () => {
    const job = makeJob('job-2');
    repo.save(job);
    repo.save({ ...job, name: 'Updated Name' });
    expect(repo.findAll()).toHaveLength(1);
    expect(repo.findById('job-2')?.name).toBe('Updated Name');
  });

  it('soft-deletes a job (moves to trash)', () => {
    repo.save(makeJob('job-3'));
    repo.delete('job-3');
    // findAll() (active jobs) should not include it
    expect(repo.findAll()).toHaveLength(0);
    // findAllDeleted() should include it with deletedAt set
    const trashed = repo.findAllDeleted();
    expect(trashed).toHaveLength(1);
    expect(trashed[0].id).toBe('job-3');
    expect(trashed[0].deletedAt).toBeDefined();
    // findById() still returns it (needed for restore/purge)
    expect(repo.findById('job-3')).not.toBeNull();
  });

  it('restores a soft-deleted job', () => {
    repo.save(makeJob('job-3b'));
    repo.delete('job-3b');
    expect(repo.findAll()).toHaveLength(0);
    repo.restore('job-3b');
    expect(repo.findAll()).toHaveLength(1);
    expect(repo.findAll()[0].deletedAt).toBeUndefined();
  });

  it('purges jobs older than a given age', () => {
    const job = makeJob('job-3c');
    repo.save(job);
    repo.delete('job-3c');
    // Manually backdate the deletedAt to 40 days ago
    const trashed = repo.findById('job-3c')!;
    trashed.deletedAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    repo.save(trashed);
    const purged = repo.purgeOlderThan(30);
    expect(purged).toBe(1);
    expect(repo.findById('job-3c')).toBeNull();
  });

  it('persists across instances', () => {
    repo.save(makeJob('job-4'));
    const repo2 = new JobRepository(TEST_DATA_DIR);
    expect(repo2.findById('job-4')).toMatchObject({ id: 'job-4' });
  });
});
