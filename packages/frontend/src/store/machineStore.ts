import { create } from 'zustand';
import { api } from '../api/client';
import type { MachineState, PortInfo, ConsoleEntry } from '../types';

interface MachineStore {
  /** Whether the frontend WebSocket can reach the backend server */
  backendConnected: boolean;
  /** Serial connection to the physical machine (via backend) */
  connectionStatus: 'disconnected' | 'connecting' | 'connected';
  machineState: MachineState | null;
  selectedPort: string;
  baudRate: number;
  consoleLog: ConsoleEntry[];
  ports: PortInfo[];

  setBackendConnected: (v: boolean) => void;
  fetchPorts: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  sendCommand: (command: string) => Promise<void>;
  addConsoleEntry: (entry: Omit<ConsoleEntry, 'id' | 'timestamp'>) => void;
  setMachineState: (state: Partial<MachineState>) => void;
  setSelectedPort: (port: string) => void;
  setBaudRate: (rate: number) => void;
}

let _entryCounter = 0;

export const useMachineStore = create<MachineStore>((set, get) => ({
  backendConnected: false,
  connectionStatus: 'disconnected',
  machineState: null,
  selectedPort: '',
  baudRate: 115200,
  consoleLog: [],
  ports: [],

  setBackendConnected: (v) => set({ backendConnected: v }),

  fetchPorts: async () => {
    const ports = await api.get('/api/ports') as PortInfo[];
    set({ ports });
    if (ports.length > 0 && !get().selectedPort) {
      set({ selectedPort: ports[0].path });
    }
  },

  connect: async () => {
    const { selectedPort, baudRate } = get();
    set({ connectionStatus: 'connecting' });
    try {
      await api.post('/api/connect', { port: selectedPort, baudRate });
      set({ connectionStatus: 'connected' });
    } catch (err) {
      set({ connectionStatus: 'disconnected' });
      throw err;
    }
  },

  disconnect: async () => {
    await api.post('/api/disconnect');
    set({
      connectionStatus: 'disconnected',
      machineState: null,
    });
  },

  sendCommand: async (command: string) => {
    get().addConsoleEntry({ direction: 'out', line: command });
    await api.post('/api/command', { command });
  },

  addConsoleEntry: (entry) => {
    const id = String(++_entryCounter);
    const newEntry: ConsoleEntry = { ...entry, id, timestamp: Date.now() };
    set((s) => ({
      consoleLog: [...s.consoleLog.slice(-499), newEntry],
    }));
  },

  setMachineState: (partial) => {
    set((s) => {
      const base: MachineState = s.machineState ?? {
        state: 'Idle',
        position: { x: 0, y: 0, z: 0 },
        workPosition: { x: 0, y: 0, z: 0 },
        feed: 0,
        spindle: 0,
      };
      return { machineState: { ...base, ...partial } };
    });
  },

  setSelectedPort: (port) => set({ selectedPort: port }),
  setBaudRate: (rate) => set({ baudRate: rate }),
}));
