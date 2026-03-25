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
    it('parses WCO field', () => {
      const result = parseStatusReport('<Idle|MPos:10.000,20.000,0.000|WCO:5.000,3.000,1.000|FS:0,0>');
      expect(result.wco).toEqual({ x: 5, y: 3, z: 1 });
    });
    it('parses WPos field', () => {
      const result = parseStatusReport('<Idle|WPos:15.000,17.000,-1.000|FS:0,0>');
      expect(result.workPosition).toEqual({ x: 15, y: 17, z: -1 });
      expect(result.position).toBeUndefined();
    });
    it('parses status with MPos and WCO together', () => {
      const result = parseStatusReport('<Run|MPos:100.000,200.000,0.000|WCO:10.000,20.000,0.000|FS:500,0>');
      expect(result.state).toBe('Run');
      expect(result.position).toEqual({ x: 100, y: 200, z: 0 });
      expect(result.wco).toEqual({ x: 10, y: 20, z: 0 });
      expect(result.feed).toBe(500);
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
