import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

// Mock the serial manager before importing the engine
const mockSerialManager = Object.assign(new EventEmitter(), {
  sendCommand: vi.fn().mockResolvedValue(undefined),
  writeRealtime: vi.fn(),
  getStatus: vi.fn().mockReturnValue('connected'),
});

vi.mock('../../src/serial/SerialManager.js', () => ({
  serialManager: mockSerialManager,
}));

// Import after mocking
const { JobExecutionEngine } = await import('../../src/jobs/JobExecutionEngine.js');

describe('JobExecutionEngine', () => {
  let engine: InstanceType<typeof JobExecutionEngine>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Access the singleton
    engine = JobExecutionEngine.instance;
  });

  it('sends M5 to turn off laser when GRBL reports an error', async () => {
    const job = {
      id: 'test-job',
      name: 'Test',
      createdAt: new Date().toISOString(),
      status: 'running' as const,
      geometry: [],
      operations: [],
      gcode: 'G0 X0 Y0\nG1 X10 Y0 F600 S800\nG1 X10 Y10 F600 S800',
    };

    const errorHandler = vi.fn();
    engine.on('jobError', errorHandler);

    await engine.start(job);

    // The engine should have sent commands via sendCommand.
    // Now simulate GRBL responding with an error for the first command.
    mockSerialManager.emit('data', 'error:24');

    // Verify M5 was sent to turn off the laser
    const m5Calls = mockSerialManager.sendCommand.mock.calls.filter(
      (call: string[]) => call[0] === 'M5'
    );
    expect(m5Calls.length).toBeGreaterThanOrEqual(1);

    // Verify the error event was emitted
    expect(errorHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'test-job',
        error: 'error:24',
      })
    );

    engine.removeListener('jobError', errorHandler);
  });

  it('uses writeRealtime (no trailing newline) for pause, resume, and abort', async () => {
    const job = {
      id: 'rt-job',
      name: 'Test',
      createdAt: new Date().toISOString(),
      status: 'running' as const,
      geometry: [],
      operations: [],
      gcode: 'G0 X0 Y0\nG1 X10 Y0 F600 S800',
    };

    await engine.start(job);

    engine.pause();
    expect(mockSerialManager.writeRealtime).toHaveBeenCalledWith('!');

    engine.resume();
    expect(mockSerialManager.writeRealtime).toHaveBeenCalledWith('~');

    engine.abort();
    expect(mockSerialManager.writeRealtime).toHaveBeenCalledWith(String.fromCharCode(0x18));
  });
});
