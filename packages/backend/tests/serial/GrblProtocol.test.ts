import { describe, it, expect } from 'vitest';
import { parseStatusReport, parseResponse } from '../../src/serial/GrblProtocol.js';

describe('GrblProtocol', () => {
  describe('parseStatusReport', () => {
    it('parses idle status with MPos', () => {
      const result = parseStatusReport('<Idle|MPos:1.000,2.000,0.000|FS:0,0>');
      expect(result.state).toBe('Idle');
      expect(result.position?.x).toBe(1.0);
      expect(result.position?.y).toBe(2.0);
    });
    it('parses Run status with feed and spindle', () => {
      const result = parseStatusReport('<Run|MPos:10.000,20.000,0.000|FS:500,100>');
      expect(result.state).toBe('Run');
      expect(result.feed).toBe(500);
      expect(result.spindle).toBe(100);
    });
    it('returns partial on malformed input', () => {
      const result = parseStatusReport('not a status');
      expect(result.state).toBeUndefined();
    });
  });
  describe('parseResponse', () => {
    it('parses ok response', () => {
      expect(parseResponse('ok').type).toBe('ok');
    });
    it('parses error response', () => {
      const r = parseResponse('error:22');
      expect(r.type).toBe('error');
      expect(r.value).toBe('22');
    });
    it('parses alarm response', () => {
      const r = parseResponse('ALARM:1');
      expect(r.type).toBe('alarm');
    });
    it('parses status response', () => {
      const r = parseResponse('<Idle|MPos:0.000,0.000,0.000|FS:0,0>');
      expect(r.type).toBe('status');
    });
  });
});
