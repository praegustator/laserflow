import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useJobStore } from '../store/jobStore';
import { useProjectStore } from '../store/projectStore';
import { useToastStore } from '../store/toastStore';
import { useAppSettings } from '../store/appSettingsStore';
import { useMachineStore } from '../store/machineStore';
import { useKeyboardShortcuts, type ShortcutDef } from '../hooks/useKeyboardShortcuts';

interface GMove {
  type: 'rapid' | 'cut';
  x: number;
  y: number;
  lineNum: number;
  /** Normalised laser power 0–1 (from S parameter). Only set for G1 cut moves. */
  power?: number;
  /** Modal feed rate in mm/min (from F parameter). Only set for G1 cut moves. */
  feed?: number;
}

/** Matches G0/G1 motion commands, tolerating leading zeros (G00/G01),
 *  lowercase letters, and coordinates written without a space (G1X10). */
const MOTION_RE = /^[Gg]0*([01])(?![0-9.])/;

/** Strip inline comments: parenthesis comments and everything after `;`. */
function stripComments(line: string): string {
  return line.replace(/\(.*?\)/g, '').split(';')[0].trim();
}

function parseGcode(gcode: string, maxS: number = 1000): GMove[] {
  const moves: GMove[] = [];
  let x = 0, y = 0, currentS = 0, currentF = 0;
  const lines = gcode.split('\n');
  lines.forEach((line, lineNum) => {
    const trimmed = stripComments(line);
    if (!trimmed) return;
    const motion = MOTION_RE.exec(trimmed);
    if (!motion) return;
    const isG0 = motion[1] === '0';
    const xMatch = trimmed.match(/[Xx](-?[\d.]+)/);
    const yMatch = trimmed.match(/[Yy](-?[\d.]+)/);
    const sMatch = trimmed.match(/[Ss](-?[\d.]+)/);
    const fMatch = trimmed.match(/[Ff]([\d.]+)/);
    const newX = xMatch ? parseFloat(xMatch[1]) : NaN;
    const newY = yMatch ? parseFloat(yMatch[1]) : NaN;
    if (sMatch) currentS = parseFloat(sMatch[1]);
    if (fMatch) currentF = parseFloat(fMatch[1]);
    // Only update coordinates when they are explicitly present in the command;
    // if neither X nor Y appears on a G0/G1 line, skip it (no movement).
    if (!isNaN(newX)) x = newX;
    if (!isNaN(newY)) y = newY;
    if (isNaN(newX) && isNaN(newY)) return;
    const move: GMove = { type: isG0 ? 'rapid' : 'cut', x, y, lineNum };
    if (!isG0) {
      // Always set power for engraving moves — even S0 means zero power
      // (white pixels in raster images) which must render at full brightness
      // in the preview, not at the default `m.power ?? 1` fallback.
      move.power = Math.min(1, Math.max(0, currentS / maxS));
      if (currentF > 0) move.feed = currentF;
    }
    moves.push(move);
  });
  return moves;
}

/** Assumed rapid (G0) traverse rate in mm/min for time estimation. */
const RAPID_FEED_MM_MIN = 3000;
/** Fallback cut feed in mm/min when the G-code never specifies F. */
const DEFAULT_CUT_FEED_MM_MIN = 1000;

/** Format a duration in seconds as a compact human-readable string. */
function formatDuration(totalSec: number): string {
  const sec = Math.round(totalSec);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${sec % 60}s`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

function highlightLine(line: string): React.ReactNode {
  const trimmed = line.trim();
  if (trimmed.startsWith(';')) return <span className="text-gray-500">{line}</span>;
  if (trimmed.startsWith('G0')) return <span className="text-blue-400">{line}</span>;
  if (trimmed.startsWith('G1')) return <span className="text-orange-400">{line}</span>;
  if (trimmed.startsWith('M')) return <span className="text-green-400">{line}</span>;
  return <span>{line}</span>;
}

type Tab = 'preview' | 'text' | 'import';

const PLAY_SPEEDS = [0.5, 1, 2, 5, 10] as const;
type PlaySpeed = (typeof PLAY_SPEEDS)[number];

export default function GcodePreview() {
  const jobs = useJobStore(s => s.jobs);
  const activeJobId = useJobStore(s => s.activeJobId);
  const queueJob = useJobStore(s => s.queueJob);
  const renameJob = useJobStore(s => s.renameJob);
  const fetchJobs = useJobStore(s => s.fetchJobs);
  const activeJob = jobs.find(j => j.id === activeJobId) ?? null;
  const projects = useProjectStore(s => s.projects);
  const activeProjectId = useProjectStore(s => s.activeProjectId);
  const activeProject = projects.find(p => p.id === activeProjectId) ?? null;
  const addToast = useToastStore(s => s.addToast);
  const navigate = useNavigate();
  const originFlip = useAppSettings(s => s.originPosition) === 'bottom-left';
  const backendConnected = useMachineStore(s => s.backendConnected);

  // When activeJobId is set (e.g. preview from Queue), prioritize that job's gcode.
  // Otherwise fall back to the active project's gcode.
  // comingFromQueue: the preview was opened from the Queue page (job already in queue)
  const comingFromQueue = !!(activeJobId && activeJob?.gcode);
  const queueableJobId = comingFromQueue ? null : (activeProject?.jobId ?? null);
  const hasGcode = !!(activeJob?.gcode ?? activeProject?.gcode);

  const [showNameDialog, setShowNameDialog] = useState(false);
  const [jobName, setJobName] = useState('');

  const handleSendToQueue = async (customName?: string) => {
    if (!queueableJobId) {
      addToast('error', 'Generate G-code first');
      return;
    }
    try {
      // Rename the job if a custom name was provided
      if (customName && customName.trim()) {
        await renameJob(queueableJobId, customName.trim());
      }
      await queueJob(queueableJobId);
      // Refresh the job list so the Queue page shows the newly queued job
      await fetchJobs();
      addToast('success', 'Job sent to queue');
      void navigate('/queue');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to send job to queue');
    }
  };

  const openNameDialog = () => {
    const job = jobs.find(j => j.id === queueableJobId);
    setJobName(job?.name ?? '');
    setShowNameDialog(true);
  };

  const handleDialogSubmit = () => {
    setShowNameDialog(false);
    void handleSendToQueue(jobName);
  };

  // When activeJobId is set (preview from Queue), prioritize job's gcode
  const initialGcode = activeJob?.gcode ?? activeProject?.gcode ?? '';

  const [gcode, setGcode] = useState(initialGcode);
  const [tab, setTab] = useState<Tab>('preview');
  const [sliderPos, setSliderPos] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState<PlaySpeed>(1);
  const [showText, setShowText] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const rafRef = useRef<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const textRef = useRef<HTMLPreElement>(null);
  const sideTextRef = useRef<HTMLDivElement>(null);
  const lineEls = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const gc = activeJob?.gcode ?? activeProject?.gcode;
    if (gc) setGcode(gc);
  }, [activeProject, activeJob]);

  const moves = useMemo(() => {
    // Determine the maximum S value in the G-code so power values can be
    // normalised to [0, 1]. We scan all G1 lines for S parameters.
    let maxS = 0;
    for (const line of gcode.split('\n')) {
      const t = stripComments(line);
      const motion = MOTION_RE.exec(t);
      if (motion && motion[1] === '1') {
        const m = t.match(/[Ss]([\d.]+)/);
        if (m) {
          const s = parseFloat(m[1]);
          if (s > maxS) maxS = s;
        }
      }
    }
    return parseGcode(gcode, maxS > 0 ? maxS : 1000);
  }, [gcode]);
  const totalMoves = moves.length;

  // Job statistics: cut/travel distances, estimated duration and job dimensions
  const stats = useMemo(() => {
    let cutDist = 0, rapidDist = 0, timeMin = 0;
    let px = 0, py = 0;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const m of moves) {
      const d = Math.hypot(m.x - px, m.y - py);
      if (m.type === 'cut') {
        cutDist += d;
        timeMin += d / (m.feed && m.feed > 0 ? m.feed : DEFAULT_CUT_FEED_MM_MIN);
      } else {
        rapidDist += d;
        timeMin += d / RAPID_FEED_MM_MIN;
      }
      px = m.x; py = m.y;
      if (m.x < minX) minX = m.x;
      if (m.y < minY) minY = m.y;
      if (m.x > maxX) maxX = m.x;
      if (m.y > maxY) maxY = m.y;
    }
    const width = moves.length > 0 ? maxX - minX : 0;
    const height = moves.length > 0 ? maxY - minY : 0;
    return { cutDist, rapidDist, timeSec: timeMin * 60, width, height };
  }, [moves]);
  const currentIdx = Math.min(Math.floor(sliderPos * totalMoves), totalMoves);

  // Line number in the source gcode that the current move corresponds to
  const currentLineNum = currentIdx > 0 ? moves[currentIdx - 1].lineNum : -1;

  // Auto-scroll the side text panel to the current line
  useEffect(() => {
    if (showText && currentLineNum >= 0) {
      lineEls.current[currentLineNum]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [currentLineNum, showText]);

  // Play animation
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    const stepSize = 0.002 * playSpeed;
    const step = () => {
      setSliderPos(p => {
        if (p >= 1) { setIsPlaying(false); return 1; }
        return Math.min(1, p + stepSize);
      });
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isPlaying, playSpeed]);

  // Step helpers
  const stepForward = useCallback(() => {
    setIsPlaying(false);
    setSliderPos(p => Math.min(1, p + 1 / Math.max(1, totalMoves)));
  }, [totalMoves]);

  const stepBack = useCallback(() => {
    setIsPlaying(false);
    setSliderPos(p => Math.max(0, p - 1 / Math.max(1, totalMoves)));
  }, [totalMoves]);

  const jumpToStart = useCallback(() => { setIsPlaying(false); setSliderPos(0); }, []);
  const jumpToEnd   = useCallback(() => { setIsPlaying(false); setSliderPos(1); }, []);

  // Keyboard shortcuts (only active on the preview tab)
  const shortcuts = useMemo<ShortcutDef[]>(() => {
    if (tab !== 'preview') return [];
    return [
      { key: ' ',          label: 'Play/Pause',    handler: () => setIsPlaying(p => !p) },
      { key: 'ArrowRight',               label: 'Step forward', handler: stepForward },
      { key: 'ArrowLeft',                label: 'Step back',    handler: stepBack },
      { key: 'ArrowRight', shift: true,  label: 'Jump to end',  handler: jumpToEnd },
      { key: 'ArrowLeft',  shift: true,  label: 'Jump to start',handler: jumpToStart },
    ];
  }, [tab, stepForward, stepBack, jumpToStart, jumpToEnd]);
  useKeyboardShortcuts(shortcuts);

  // When bottom-left origin is used, G-code Y=0 is at the physical bottom.
  // SVG has Y=0 at the top, so we negate Y for display to match how the laser sees it.
  const fy = useCallback((y: number) => originFlip ? -y : y, [originFlip]);

  // Compute bounding box (using display-space Y)
  const computeBounds = useCallback(() => {
    if (moves.length === 0) return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const m of moves) {
      const dy = fy(m.y);
      if (m.x < minX) minX = m.x;
      if (dy < minY) minY = dy;
      if (m.x > maxX) maxX = m.x;
      if (dy > maxY) maxY = dy;
    }
    const padX = Math.max(5, (maxX - minX) * 0.05);
    const padY = Math.max(5, (maxY - minY) * 0.05);
    return { minX: minX - padX, minY: minY - padY, maxX: maxX + padX, maxY: maxY + padY };
  }, [moves, fy]);

  const bounds = computeBounds();
  const vbW = bounds.maxX - bounds.minX;
  const vbH = bounds.maxY - bounds.minY;
  const viewBox = `${bounds.minX} ${bounds.minY} ${vbW} ${vbH}`;

  // Build grid lines (10 mm minor, 50 mm major)
  const GRID_MINOR = 10;
  const GRID_MAJOR = 50;
  const gridLines = useMemo(() => {
    const lines: React.ReactNode[] = [];
    const startX = Math.floor(bounds.minX / GRID_MINOR) * GRID_MINOR;
    const startY = Math.floor(bounds.minY / GRID_MINOR) * GRID_MINOR;
    const sw = vbW * 0.001; // minor stroke width
    const swMajor = vbW * 0.002; // major stroke width
    for (let x = startX; x <= bounds.maxX; x += GRID_MINOR) {
      const isMajor = x % GRID_MAJOR === 0;
      lines.push(
        <line key={`gx${x}`} x1={x} y1={bounds.minY} x2={x} y2={bounds.maxY}
          stroke="#374151" strokeWidth={isMajor ? swMajor : sw} />,
      );
      if (isMajor) {
        lines.push(
          <text key={`lx${x}`} x={x} y={bounds.minY + vbH * 0.03} fontSize={vbW * 0.022}
            fill="#6b7280" textAnchor="middle">{x}</text>,
        );
      }
    }
    for (let displayY = startY; displayY <= bounds.maxY; displayY += GRID_MINOR) {
      const isMajor = Math.round(Math.abs(displayY)) % GRID_MAJOR === 0;
      lines.push(
        <line key={`gy${displayY}`} x1={bounds.minX} y1={displayY} x2={bounds.maxX} y2={displayY}
          stroke="#374151" strokeWidth={isMajor ? swMajor : sw} />,
      );
      if (isMajor) {
        // Show original (positive) G-code Y value in the label
        const labelVal = originFlip ? -displayY : displayY;
        lines.push(
          <text key={`ly${displayY}`} x={bounds.minX + vbW * 0.01} y={displayY - vbH * 0.005} fontSize={vbW * 0.022}
            fill="#6b7280">{labelVal}</text>,
        );
      }
    }
    return lines;
  }, [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, vbW, vbH, originFlip]);

  // Build SVG path data for visible moves (apply Y flip).
  // Cut segments are grouped by their normalised power value so they can be
  // rendered with a per-power colour (bright = high power, dim = low power).
  const visibleMoves = moves.slice(0, currentIdx);
  const rapidSegments: string[] = [];
  /** Map from power bucket (0-20 integer buckets) to path-data string. */
  const cutSegmentsByPower = new Map<number, string[]>();
  let prevX = 0, prevY = fy(0);
  for (const m of visibleMoves) {
    const displayY = fy(m.y);
    const seg = `M${prevX},${prevY} L${m.x},${displayY}`;
    if (m.type === 'rapid') {
      rapidSegments.push(seg);
    } else {
      // Round power to 20 discrete buckets so similar values share the same
      // SVG element (avoids creating thousands of individual paths).
      const bucket = Math.round((m.power ?? 1) * 20);
      const arr = cutSegmentsByPower.get(bucket) ?? [];
      arr.push(seg);
      cutSegmentsByPower.set(bucket, arr);
    }
    prevX = m.x;
    prevY = displayY;
  }

  /** Convert normalised power 0–1 to a monochrome colour string.
   *  Full power → near-white, near-zero → dark gray. */
  function powerToColor(power: number): string {
    // Lightness: 20% at zero power (barely visible on dark bg), 95% at full power.
    const l = Math.round(20 + power * 75);
    return `hsl(0,0%,${l}%)`;
  }

  const handleExport = () => {
    if (!gcode) return;
    const blob = new Blob([gcode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'laserflow-job.gcode';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDropFile = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const text = await file.text();
    setGcode(text);
    setSliderPos(1);
    setTab('preview');
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setGcode(text);
    setSliderPos(1);
    setTab('preview');
    e.target.value = '';
  };

  const handleLoadPaste = () => {
    if (pasteText.trim()) {
      setGcode(pasteText.trim());
      setSliderPos(1);
      setTab('preview');
      setPasteText('');
    }
  };

  const gcodeLines = useMemo(() => gcode.split('\n'), [gcode]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex-shrink-0 bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center gap-3">
        <h1 className="text-sm font-semibold text-gray-300 uppercase tracking-widest">G-code Preview</h1>
        <div className="flex gap-1 ml-4">
          {(['preview', 'text', 'import'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-xs rounded font-semibold transition-colors capitalize ${tab === t ? 'bg-orange-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            >{t}</button>
          ))}
        </div>
        <div className="flex-1" />
        {totalMoves > 0 && (
          <span className="text-xs text-gray-500 hidden md:inline" title={`Cut distance · travel distance · estimated duration (rapids assumed at ${RAPID_FEED_MM_MIN} mm/min)`}>
            ✂ {Math.round(stats.cutDist).toLocaleString()} mm
            {' · '}↔ {Math.round(stats.rapidDist).toLocaleString()} mm
            {' · '}~{formatDuration(stats.timeSec)}
            {' · '}{stats.width.toFixed(1)}×{stats.height.toFixed(1)} mm
          </span>
        )}
        <span className="text-xs text-gray-500">{totalMoves} moves</span>
        {comingFromQueue ? (
          <button
            onClick={() => { void navigate('/queue'); }}
            className="px-3 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 font-semibold transition-colors"
            title="Go back to the Queue"
          >⬅ Go to Queue</button>
        ) : (
          <button
            onClick={openNameDialog}
            disabled={!hasGcode || !queueableJobId || !backendConnected}
            className="px-3 py-1.5 text-xs rounded bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold transition-colors"
            title={!backendConnected ? 'Backend unavailable — start the server to queue jobs' : 'Send this G-code to the job queue'}
          >📤 Send to Queue</button>
        )}
        <button
          onClick={handleExport}
          disabled={!gcode}
          className="px-3 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 disabled:opacity-40 transition-colors"
        >↓ Export .gcode</button>
      </div>

      {/* Name Dialog */}
      {showNameDialog && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowNameDialog(false)}>
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 border border-gray-700" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-200 mb-4">Name Your Job</h2>
            <input
              type="text"
              value={jobName}
              onChange={e => setJobName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleDialogSubmit();
                if (e.key === 'Escape') setShowNameDialog(false);
              }}
              placeholder="Job name (optional)"
              autoFocus
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-orange-500"
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowNameDialog(false)}
                className="flex-1 px-4 py-2 text-sm rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
              >Cancel</button>
              <button
                onClick={handleDialogSubmit}
                className="flex-1 px-4 py-2 text-sm rounded bg-green-700 hover:bg-green-600 text-white font-semibold transition-colors"
              >Send to Queue</button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'preview' && (
          <div className="flex flex-col h-full">
            {gcode ? (
              <>
                {/* SVG + optional side text */}
                <div className="flex-1 min-h-0 flex">
                  <div className="flex-1 min-h-0 bg-gray-950">
                    <svg
                      ref={svgRef}
                      className="w-full h-full"
                      viewBox={viewBox}
                      preserveAspectRatio="xMidYMid meet"
                    >
                      {/* Background */}
                      <rect x={bounds.minX} y={bounds.minY} width={vbW} height={vbH} fill="#111827" />
                      {/* Grid */}
                      {gridLines}
                      {/* Rapid moves */}
                      {rapidSegments.map((d, i) => (
                        <path key={`r${i}`} d={d} fill="none" stroke="#4b5563" strokeWidth={vbW * 0.002} strokeDasharray={`${vbW * 0.01},${vbW * 0.005}`} />
                      ))}
                      {/* Cut moves — coloured by laser power (bright = high power, dim = low) */}
                      {Array.from(cutSegmentsByPower.entries()).map(([bucket, segs]) => (
                        <path
                          key={`c${bucket}`}
                          d={segs.join(' ')}
                          fill="none"
                          stroke={powerToColor(bucket / 20)}
                          strokeWidth={vbW * 0.002}
                        />
                      ))}
                      {/* Current position dot */}
                      {visibleMoves.length > 0 && (
                        <circle
                          cx={visibleMoves[visibleMoves.length - 1].x}
                          cy={fy(visibleMoves[visibleMoves.length - 1].y)}
                          r={vbW * 0.008}
                          fill="#fbbf24"
                        />
                      )}
                    </svg>
                  </div>

                  {/* Side text panel */}
                  {showText && (
                    <div ref={sideTextRef} className="w-72 flex-shrink-0 border-l border-gray-800 overflow-auto bg-gray-950">
                      <pre className="p-3 text-xs font-mono leading-5">
                        {gcodeLines.map((line, i) => (
                          <div
                            key={i}
                            ref={el => { lineEls.current[i] = el; }}
                            className={`flex gap-2 ${i === currentLineNum ? 'bg-orange-900/40 rounded' : ''}`}
                          >
                            <span className="text-gray-600 select-none w-7 text-right flex-shrink-0">{i + 1}</span>
                            {highlightLine(line)}
                          </div>
                        ))}
                      </pre>
                    </div>
                  )}
                </div>

                {/* Controls */}
                <div className="flex-shrink-0 bg-gray-900 border-t border-gray-800 px-3 py-2 flex items-center gap-2 flex-wrap">
                  {/* Jump / step / play buttons */}
                  <button
                    onClick={jumpToStart}
                    title="Jump to start (Shift+←)"
                    className="px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
                  >⏮</button>
                  <button
                    onClick={stepBack}
                    title="Step back (←)"
                    className="px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
                  >◀</button>
                  <button
                    onClick={() => setIsPlaying(p => !p)}
                    title="Play/Pause (Space)"
                    className="px-3 py-1 text-xs rounded bg-orange-600 hover:bg-orange-500 text-white font-semibold"
                  >{isPlaying ? '⏸ Pause' : '▶ Play'}</button>
                  <button
                    onClick={stepForward}
                    title="Step forward (→)"
                    className="px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
                  >▶</button>
                  <button
                    onClick={jumpToEnd}
                    title="Jump to end (Shift+→)"
                    className="px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
                  >⏭</button>

                  {/* Speed selector */}
                  <div className="flex items-center gap-1 ml-1">
                    <span className="text-xs text-gray-500">Speed:</span>
                    {PLAY_SPEEDS.map(s => (
                      <button
                        key={s}
                        onClick={() => setPlaySpeed(s)}
                        className={`px-1.5 py-0.5 text-xs rounded transition-colors ${playSpeed === s ? 'bg-orange-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                      >{s}×</button>
                    ))}
                  </div>

                  {/* Slider */}
                  <input
                    type="range"
                    min={0}
                    max={totalMoves}
                    value={currentIdx}
                    onChange={e => { setIsPlaying(false); setSliderPos(Number(e.target.value) / Math.max(1, totalMoves)); }}
                    className="flex-1 accent-orange-500 min-w-0"
                  />

                  <span className="text-xs text-gray-400 w-24 text-right tabular-nums">
                    {currentIdx.toLocaleString()} / {totalMoves.toLocaleString()}
                  </span>

                  {/* Toggle side text */}
                  <button
                    onClick={() => setShowText(v => !v)}
                    title="Toggle G-code text panel"
                    className={`px-2 py-1 text-xs rounded transition-colors ${showText ? 'bg-orange-500/20 text-orange-400' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                  >≡ Text</button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-center">
                <div>
                  <div className="text-5xl mb-4">📋</div>
                  <h2 className="text-lg font-semibold text-gray-400">No G-code loaded</h2>
                  <p className="text-sm text-gray-600 mt-2">Generate G-code in the Editor, or import a file</p>
                  <button onClick={() => setTab('import')} className="mt-4 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold transition-colors">Import G-code</button>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'text' && (
          <div className="flex flex-col h-full">
            <div className="flex-shrink-0 flex justify-end px-4 py-2 bg-gray-900 border-b border-gray-800">
              <button
                onClick={() => { void navigator.clipboard.writeText(gcode); }}
                className="px-3 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
              >Copy</button>
            </div>
            <pre ref={textRef} className="flex-1 overflow-auto p-4 text-xs font-mono bg-gray-950 leading-5">
              {gcodeLines.map((line, i) => (
                <div key={i} className="flex gap-3">
                  <span className="text-gray-600 select-none w-8 text-right flex-shrink-0">{i + 1}</span>
                  {highlightLine(line)}
                </div>
              ))}
            </pre>
          </div>
        )}

        {tab === 'import' && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="w-full max-w-lg space-y-6">
              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { void handleDropFile(e); }}
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${dragOver ? 'border-orange-400 bg-orange-900/10' : 'border-gray-700'}`}
              >
                <div className="text-3xl mb-3">📁</div>
                <p className="text-gray-400 text-sm mb-3">Drop .gcode / .nc / .txt file here</p>
                <label className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm cursor-pointer transition-colors">
                  Browse File
                  <input type="file" accept=".gcode,.nc,.txt,.cnc" className="hidden" onChange={e => { void handleImportFile(e); }} />
                </label>
              </div>

              {/* Paste area */}
              <div>
                <label className="text-xs text-gray-500 uppercase mb-1 block">Or paste G-code</label>
                <textarea
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                  className="w-full h-32 bg-gray-800 border border-gray-700 rounded-lg p-3 text-xs font-mono text-gray-100 focus:outline-none focus:border-orange-500 resize-none"
                  placeholder="; Paste G-code here..."
                />
                <button
                  onClick={handleLoadPaste}
                  disabled={!pasteText.trim()}
                  className="mt-2 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white text-sm font-semibold transition-colors"
                >Load G-code</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
