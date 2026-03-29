import { EventEmitter } from 'events';
import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';

export interface PortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  pnpId?: string;
  locationId?: string;
  productId?: string;
  vendorId?: string;
}

type ConnectionStatus = 'connected' | 'disconnected' | 'connecting';

class SerialManager extends EventEmitter {
  private static _instance: SerialManager;
  private port: SerialPort | null = null;
  private status: ConnectionStatus = 'disconnected';

  private constructor() {
    super();
  }

  static get instance(): SerialManager {
    if (!SerialManager._instance) {
      SerialManager._instance = new SerialManager();
    }
    return SerialManager._instance;
  }

  async listPorts(): Promise<PortInfo[]> {
    return SerialPort.list();
  }

  async connect(path: string, baudRate: number): Promise<void> {
    if (this.port?.isOpen) {
      await this.disconnect();
    }

    this.status = 'connecting';

    return new Promise((resolve, reject) => {
      const sp = new SerialPort({ path, baudRate }, (err) => {
        if (err) {
          this.status = 'disconnected';
          reject(err);
          return;
        }
      });

      const parser = sp.pipe(new ReadlineParser({ delimiter: '\n' }));

      parser.on('data', (line: string) => {
        const trimmed = line.trim();
        if (trimmed) {
          this.emit('data', trimmed);
        }
      });

      sp.on('open', () => {
        this.port = sp;
        this.status = 'connected';
        resolve();
      });

      sp.on('error', (err: Error) => {
        this.emit('error', err);
        if (this.status === 'connecting') {
          this.status = 'disconnected';
          reject(err);
        }
      });

      sp.on('close', () => {
        this.port = null;
        this.status = 'disconnected';
        this.emit('disconnect');
      });
    });
  }

  async disconnect(): Promise<void> {
    if (!this.port?.isOpen) {
      this.port = null;
      this.status = 'disconnected';
      return;
    }

    return new Promise((resolve, reject) => {
      this.port!.close((err) => {
        this.port = null;
        this.status = 'disconnected';
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async sendCommand(cmd: string): Promise<void> {
    if (!this.port?.isOpen) {
      throw new Error('Serial port not connected');
    }

    return new Promise((resolve, reject) => {
      this.port!.write(`${cmd}\n`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Write a GRBL realtime character (?, !, ~, 0x18, etc.) directly to the
   * serial port WITHOUT appending a newline.  Realtime characters are
   * intercepted by GRBL's serial ISR and never enter the line buffer, but a
   * trailing '\n' WOULD enter the buffer and can split an in-flight G-code
   * line, causing parse errors such as error:24.
   */
  writeRealtime(char: string): void {
    if (!this.port?.isOpen) return;
    this.port.write(char, () => {});
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }
}

export const serialManager = SerialManager.instance;
