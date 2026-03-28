import { useState } from 'react';
import { useMachineStore } from '../store/machineStore';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHome, faLockOpen, faRotateLeft, faCrosshairs } from '@fortawesome/free-solid-svg-icons';

const STEP_SIZES = [0.1, 1, 10, 100] as const;
type StepSize = (typeof STEP_SIZES)[number];

const DEFAULT_FEED = 1000;

function JogBtn({
  label,
  onClick,
  className = '',
}: {
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center rounded bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-gray-100 font-bold select-none transition-colors ${className}`}
    >
      {label}
    </button>
  );
}

export default function JogControls() {
  const [step, setStep] = useState<StepSize>(1);
  const connectionStatus = useMachineStore((s) => s.connectionStatus);
  const sendCommand = useMachineStore((s) => s.sendCommand);

  const connected = connectionStatus === 'connected';

  const jog = (axis: string, dir: 1 | -1) => {
    const dist = dir * step;
    sendCommand(`$J=G91G21${axis}${dist}F${DEFAULT_FEED}`);
  };

  const sendRaw = (cmd: string) => sendCommand(cmd);

  return (
    <div className="space-y-4">
      {/* Step size */}
      <div>
        <div className="text-xs text-gray-500 uppercase mb-2">Step (mm)</div>
        <div className="flex gap-1">
          {STEP_SIZES.map((s) => (
            <button
              key={s}
              onClick={() => setStep(s)}
              className={`flex-1 py-1.5 text-xs rounded font-semibold transition-colors ${
                step === s
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* X/Y grid */}
      <div>
        <div className="text-xs text-gray-500 uppercase mb-2">X / Y</div>
        <div className="grid grid-cols-3 grid-rows-3 gap-1 w-full aspect-square max-w-[180px]">
          <div />
          <JogBtn
            label="▲ Y+"
            onClick={() => jog('Y', 1)}
            className="h-full text-xs"
          />
          <div />
          <JogBtn
            label="◀ X-"
            onClick={() => jog('X', -1)}
            className="h-full text-xs"
          />
          <button
            disabled
            className="flex items-center justify-center rounded bg-gray-800 text-gray-600 text-xs cursor-default"
          >
            XY
          </button>
          <JogBtn
            label="X+ ▶"
            onClick={() => jog('X', 1)}
            className="h-full text-xs"
          />
          <div />
          <JogBtn
            label="▼ Y-"
            onClick={() => jog('Y', -1)}
            className="h-full text-xs"
          />
          <div />
        </div>
      </div>

      {/* Actions */}
      <div>
        <div className="text-xs text-gray-500 uppercase mb-2">Actions</div>
        <div className="grid grid-cols-2 gap-1">
          <button
            onClick={() => sendRaw('G90 G0 X0 Y0')}
            disabled={!connected}
            className="py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-gray-200 transition-colors flex items-center justify-center gap-1"
          >
            <FontAwesomeIcon icon={faHome} /> Home
          </button>
          <button
            onClick={() => sendRaw('$X')}
            disabled={!connected}
            className="py-1.5 text-xs rounded bg-yellow-700 hover:bg-yellow-600 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors flex items-center justify-center gap-1"
          >
            <FontAwesomeIcon icon={faLockOpen} /> Unlock
          </button>
          <button
            onClick={() => sendRaw('\x18')}
            disabled={!connected}
            className="py-1.5 text-xs rounded bg-red-800 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors flex items-center justify-center gap-1"
          >
            <FontAwesomeIcon icon={faRotateLeft} /> Reset
          </button>
          <button
            onClick={() => sendRaw('G10L20P0X0Y0Z0')}
            disabled={!connected}
            className="py-1.5 text-xs rounded bg-green-800 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors flex items-center justify-center gap-1"
          >
            <FontAwesomeIcon icon={faCrosshairs} /> Set Origin
          </button>
        </div>
      </div>
    </div>
  );
}
