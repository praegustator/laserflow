import { useEffect, useRef, useState } from 'react';
import { useMachineStore } from '../store/machineStore';
import { useAppSettings } from '../store/appSettingsStore';
import type { ConsoleEntry } from '../types';
import { grblErrorDescription } from '../utils/grblCodes';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowsDownToLine, faTrash } from '@fortawesome/free-solid-svg-icons';

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

  const description = isError ? grblErrorDescription(entry.line) : undefined;

  return (
    <div className="flex items-start gap-2 px-3 py-0.5 hover:bg-gray-800/40 group font-mono text-xs leading-5">
      <span className="text-gray-600 flex-shrink-0 w-[68px]">{time}</span>
      <span className={`flex-shrink-0 ${lineColor}`}>{arrow}</span>
      <span className={lineColor}>
        {entry.line}
        {description && (
          <span className="text-red-300/70 ml-2 not-italic font-sans">— {description}</span>
        )}
      </span>
    </div>
  );
}

type DirectionFilter = 'all' | 'in' | 'out';

export default function ConsoleLog() {
  const consoleLog = useMachineStore((s) => s.consoleLog);
  const clearConsoleLog = useMachineStore((s) => s.clearConsoleLog);
  const autoScrollConsole = useAppSettings((s) => s.autoScrollConsole);
  const setAutoScrollConsole = useAppSettings((s) => s.setAutoScrollConsole);
  const containerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  const [search, setSearch] = useState('');
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('all');

  const filteredLog = consoleLog.filter((entry) => {
    if (directionFilter !== 'all' && entry.direction !== directionFilter) return false;
    if (search && !entry.line.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  /** Scroll container to the very bottom */
  const scrollToBottom = () => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  // Track if user is near the bottom
  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  useEffect(() => {
    if (!autoScrollConsole) return;
    if (isAtBottomRef.current) scrollToBottom();
  }, [consoleLog, autoScrollConsole]);

  const handleToggleAutoScroll = () => {
    const next = !autoScrollConsole;
    setAutoScrollConsole(next);
    // Immediately jump to bottom when enabling
    if (next) scrollToBottom();
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Filter bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-800 bg-gray-900 flex-shrink-0">
        <input
          type="text"
          placeholder="Filter…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:border-orange-500 font-mono"
        />
        <div className="flex gap-0.5">
          {(['all', 'in', 'out'] as DirectionFilter[]).map(d => (
            <button
              key={d}
              onClick={() => setDirectionFilter(d)}
              aria-label={d === 'all' ? 'Show all messages' : d === 'in' ? 'Show incoming messages' : 'Show outgoing messages'}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                directionFilter === d
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              {d === 'all' ? 'All' : d === 'in' ? '← In' : '→ Out'}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-600">{filteredLog.length}/{consoleLog.length}</span>
        {/* Auto-scroll toggle */}
        <button
          onClick={handleToggleAutoScroll}
          title={autoScrollConsole ? 'Auto-scroll on — click to disable' : 'Auto-scroll off — click to enable'}
          className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
            autoScrollConsole
              ? 'bg-orange-500 text-white'
              : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
          }`}
        >
          <FontAwesomeIcon icon={faArrowsDownToLine} />
          <span>Auto</span>
        </button>
        {/* Clear all */}
        <button
          onClick={clearConsoleLog}
          title="Clear all console output"
          className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-gray-700 text-gray-400 hover:bg-red-900/60 hover:text-red-300 transition-colors"
        >
          <FontAwesomeIcon icon={faTrash} />
          <span>Clear</span>
        </button>
      </div>

      {/* Log entries */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto bg-gray-950 py-2 min-h-0"
      >
        {filteredLog.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-600 text-sm">
            {consoleLog.length === 0 ? 'No console output yet' : 'No matching entries'}
          </div>
        ) : (
          filteredLog.map((entry) => <EntryRow key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  );
}
