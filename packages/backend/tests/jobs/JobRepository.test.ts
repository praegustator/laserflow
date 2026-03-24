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

  it('deletes a job', () => {
    repo.save(makeJob('job-3'));
    repo.delete('job-3');
    expect(repo.findAll()).toHaveLength(0);
    expect(repo.findById('job-3')).toBeNull();
  });

  it('persists across instances', () => {
    repo.save(makeJob('job-4'));
    const repo2 = new JobRepository(TEST_DATA_DIR);
    expect(repo2.findById('job-4')).toMatchObject({ id: 'job-4' });
  });
});
