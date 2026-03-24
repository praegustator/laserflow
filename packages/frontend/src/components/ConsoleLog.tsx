import { useEffect, useRef } from 'react';
import { useMachineStore } from '../store/machineStore';
import type { ConsoleEntry } from '../types';

function EntryRow({ entry }: { entry: ConsoleEntry }) {
  const time = new Date(entry.timestamp).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const isError =
    entry.direction === 'in' &&
    (entry.line.startsWith('error') || entry.line.startsWith('ALARM'));

  const lineColor = isError
    ? 'text-red-400'
    : entry.direction === 'out'
      ? 'text-blue-400'
      : 'text-green-400';

  const arrow = entry.direction === 'out' ? '→' : '←';

  return (
    <div className="flex items-start gap-2 px-3 py-0.5 hover:bg-gray-800/40 group font-mono text-xs leading-5">
      <span className="text-gray-600 flex-shrink-0 w-[68px]">{time}</span>
      <span className={`flex-shrink-0 ${lineColor}`}>{arrow}</span>
      <span className={lineColor}>{entry.line}</span>
    </div>
  );
}

export default function ConsoleLog() {
  const consoleLog = useMachineStore((s) => s.consoleLog);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  // Track if user is near the bottom
  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  useEffect(() => {
    if (isAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [consoleLog]);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto bg-gray-950 py-2 min-h-0"
    >
      {consoleLog.length === 0 ? (
        <div className="flex items-center justify-center h-full text-gray-600 text-sm">
          No console output yet
        </div>
      ) : (
        consoleLog.map((entry) => <EntryRow key={entry.id} entry={entry} />)
      )}
      <div ref={bottomRef} />
    </div>
  );
}
