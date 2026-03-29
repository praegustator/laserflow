import { EventEmitter } from 'events';
import { serialManager } from '../serial/SerialManager.js';
import { parseResponse } from '../serial/GrblProtocol.js';
import type { Job, JobProgress, JobStatus } from '../types/index.js';

// GRBL's serial RX buffer is 128 bytes; we keep 1 byte spare for safety.
// Streaming must not exceed this limit or commands will be dropped/corrupted.
const GRBL_BUFFER_SIZE = 127;

interface SentLineRecord {
  /** 1-based line number within the G-code file */
  lineNumber: number;
  /** Exact G-code text that was sent */
  content: string;
}

export class JobExecutionEngine extends EventEmitter {
  private static _instance: JobExecutionEngine;
  private currentJob: Job | null = null;
  private lines: string[] = [];
  private currentLine = 0;
  private bytesSent = 0;
  private startTime = 0;
  private paused = false;
  private aborted = false;
  private sentLines: number[] = [];
  /** Parallel queue to sentLines that tracks content and line number of each sent command. */
  private sentLineContents: SentLineRecord[] = [];

  private constructor() {
    super();
    serialManager.on('data', (line: string) => this.handleData(line));
  }

  static get instance(): JobExecutionEngine {
    if (!JobExecutionEngine._instance) {
      JobExecutionEngine._instance = new JobExecutionEngine();
    }
    return JobExecutionEngine._instance;
  }

  private handleData(line: string): void {
    const resp = parseResponse(line);
    if (resp.type === 'ok' || resp.type === 'error') {
      const sentLen = this.sentLines.shift();
      const sentRecord = this.sentLineContents.shift();
      if (sentLen !== undefined) {
        this.bytesSent -= sentLen;
      }

      if (resp.type === 'error' && this.currentJob) {
        const jobId = this.currentJob.id;
        this.emit('jobError', {
          jobId,
          error: line,
          failedGcodeLineNumber: sentRecord?.lineNumber,
          failedGcodeLineContent: sentRecord?.content,
        });
        this.aborted = true;

        // Safety: immediately turn off the laser/spindle so it does not
        // keep burning in one spot after motion has stopped.
        serialManager.sendCommand('M5').catch((e) => {
          this.emit('jobError', { jobId, error: `Failed to send M5 after GRBL error: ${e}` });
        });

        this.currentJob = null;
        this.lines = [];
        this.currentLine = 0;
        this.bytesSent = 0;
        this.sentLines = [];
        this.sentLineContents = [];
        return;
      }

      this.sendNext();
    }
  }

  private sendNext(): void {
    if (!this.currentJob || this.paused || this.aborted) return;

    while (this.currentLine < this.lines.length) {
      const line = this.lines[this.currentLine];
      if (!line || line.startsWith(';') || line.trim() === '') {
        this.currentLine++;
        continue;
      }

      const lineBytes = line.length + 1;
      if (this.bytesSent + lineBytes > GRBL_BUFFER_SIZE) break;

      serialManager.sendCommand(line).catch((err) => {
        this.emit('jobError', { jobId: this.currentJob?.id, error: String(err) });
      });

      this.sentLines.push(lineBytes);
      this.sentLineContents.push({ lineNumber: this.currentLine + 1, content: line });
      this.bytesSent += lineBytes;
      this.currentLine++;

      const progress = this.getProgress();
      this.emit('jobProgress', progress);
    }

    if (this.currentLine >= this.lines.length && this.sentLines.length === 0) {
      const completedJobId = this.currentJob.id;
      this.currentJob = null;
      this.emit('jobCompleted', { jobId: completedJobId });
    }
  }

  private getProgress(): JobProgress {
    const elapsed = Date.now() - this.startTime;
    const total = this.lines.filter((l) => l && !l.startsWith(';') && l.trim()).length;
    const done = Math.min(this.currentLine, total);
    const rate = elapsed > 0 ? done / elapsed : 0;
    const remaining = rate > 0 ? (total - done) / rate : 0;

    return {
      jobId: this.currentJob?.id ?? '',
      state: 'running' as JobStatus,
      currentLine: this.currentLine,
      totalLines: this.lines.length,
      elapsed,
      eta: remaining,
    };
  }

  async start(job: Job): Promise<void> {
    if (!job.gcode) throw new Error('Job has no G-code');

    this.currentJob = job;
    this.lines = job.gcode.split('\n');
    this.currentLine = 0;
    this.bytesSent = 0;
    this.sentLines = [];
    this.sentLineContents = [];
    this.paused = false;
    this.aborted = false;
    this.startTime = Date.now();

    this.emit('jobStarted', { jobId: job.id });
    this.sendNext();
  }

  pause(): void {
    this.paused = true;
    serialManager.writeRealtime('!');
  }

  resume(): void {
    this.paused = false;
    serialManager.writeRealtime('~');
    this.sendNext();
  }

  abort(): void {
    this.aborted = true;
    serialManager.writeRealtime(String.fromCharCode(0x18));
    this.currentJob = null;
    this.lines = [];
    this.currentLine = 0;
    this.bytesSent = 0;
    this.sentLines = [];
    this.sentLineContents = [];
  }
}

export const jobEngine = JobExecutionEngine.instance;
