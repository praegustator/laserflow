import { useEffect, useRef, useState, useCallback } from 'react';
import { useJobStore } from '../store/jobStore';

interface GMove {
  type: 'rapid' | 'cut';
  x: number;
  y: number;
}

function parseGcode(gcode: string): GMove[] {
  const moves: GMove[] = [];
  let x = 0, y = 0;
  for (const line of gcode.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith(';') || !trimmed) continue;
    const isG0 = trimmed.startsWith('G0 ') || trimmed.startsWith('G0\t') || trimmed === 'G0';
    const isG1 = trimmed.startsWith('G1 ') || trimmed.startsWith('G1\t') || trimmed === 'G1';
    if (!isG0 && !isG1) continue;
    const xMatch = trimmed.match(/X(-?[\d.]+)/);
    const yMatch = trimmed.match(/Y(-?[\d.]+)/);
    const newX = xMatch ? parseFloat(xMatch[1]) : NaN;
    const newY = yMatch ? parseFloat(yMatch[1]) : NaN;
    if (!isNaN(newX)) x = newX;
    if (!isNaN(newY)) y = newY;
    moves.push({ type: isG0 ? 'rapid' : 'cut', x, y });
  }
  return moves;
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

export default function GcodePreview() {
  const jobs = useJobStore(s => s.jobs);
  const activeJobId = useJobStore(s => s.activeJobId);
  const activeJob = jobs.find(j => j.id === activeJobId) ?? null;

  const [gcode, setGcode] = useState(activeJob?.gcode ?? '');
  const [tab, setTab] = useState<Tab>('preview');
  const [sliderPos, setSliderPos] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const rafRef = useRef<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const textRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (activeJob?.gcode) setGcode(activeJob.gcode);
  }, [activeJob]);

  const moves = parseGcode(gcode);
  const totalMoves = moves.length;
  const currentIdx = Math.min(Math.floor(sliderPos * totalMoves), totalMoves);

  // Play animation
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    const step = () => {
      setSliderPos(p => {
        if (p >= 1) { setIsPlaying(false); return 1; }
        return Math.min(1, p + 0.002);
      });
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isPlaying]);

  // Compute bounding box
  const computeBounds = useCallback(() => {
    if (moves.length === 0) return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const m of moves) {
      if (m.x < minX) minX = m.x;
      if (m.y < minY) minY = m.y;
      if (m.x > maxX) maxX = m.x;
      if (m.y > maxY) maxY = m.y;
    }
    const padX = Math.max(5, (maxX - minX) * 0.05);
    const padY = Math.max(5, (maxY - minY) * 0.05);
    return { minX: minX - padX, minY: minY - padY, maxX: maxX + padX, maxY: maxY + padY };
  }, [moves]);

  const bounds = computeBounds();
  const vbW = bounds.maxX - bounds.minX;
  const vbH = bounds.maxY - bounds.minY;
  const viewBox = `${bounds.minX} ${bounds.minY} ${vbW} ${vbH}`;

  // Build SVG path data for visible moves
  const visibleMoves = moves.slice(0, currentIdx);
  const rapidSegments: string[] = [];
  const cutSegments: string[] = [];
  let prevX = 0, prevY = 0;
  for (const m of visibleMoves) {
    const seg = `M${prevX},${prevY} L${m.x},${m.y}`;
    if (m.type === 'rapid') rapidSegments.push(seg);
    else cutSegments.push(seg);
    prevX = m.x;
    prevY = m.y;
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

  const gcodeLines = gcode.split('\n');

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
        <span className="text-xs text-gray-500">{totalMoves} moves</span>
        <button
          onClick={handleExport}
          disabled={!gcode}
          className="px-3 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 disabled:opacity-40 transition-colors"
        >↓ Export .gcode</button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'preview' && (
          <div className="flex flex-col h-full">
            {gcode ? (
              <>
                <div className="flex-1 min-h-0 bg-gray-950">
                  <svg
                    ref={svgRef}
                    className="w-full h-full"
                    viewBox={viewBox}
                    preserveAspectRatio="xMidYMid meet"
                  >
                    {/* Background */}
                    <rect x={bounds.minX} y={bounds.minY} width={vbW} height={vbH} fill="#111827" />
                    {/* Rapid moves */}
                    {rapidSegments.map((d, i) => (
                      <path key={`r${i}`} d={d} fill="none" stroke="#4b5563" strokeWidth={vbW * 0.002} strokeDasharray={`${vbW * 0.01},${vbW * 0.005}`} />
                    ))}
                    {/* Cut moves */}
                    {cutSegments.map((d, i) => (
                      <path key={`c${i}`} d={d} fill="none" stroke="#f97316" strokeWidth={vbW * 0.002} />
                    ))}
                    {/* Current position dot */}
                    {visibleMoves.length > 0 && (
                      <circle
                        cx={visibleMoves[visibleMoves.length - 1].x}
                        cy={visibleMoves[visibleMoves.length - 1].y}
                        r={vbW * 0.008}
                        fill="#fbbf24"
                      />
                    )}
                  </svg>
                </div>
                {/* Controls */}
                <div className="flex-shrink-0 bg-gray-900 border-t border-gray-800 px-4 py-3 flex items-center gap-3">
                  <button
                    onClick={() => { setIsPlaying(false); setSliderPos(0); }}
                    className="px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
                  >⏮ Reset</button>
                  <button
                    onClick={() => setIsPlaying(p => !p)}
                    className="px-3 py-1 text-xs rounded bg-orange-600 hover:bg-orange-500 text-white font-semibold"
                  >{isPlaying ? '⏸ Pause' : '▶ Play'}</button>
                  <input
                    type="range"
                    min={0}
                    max={totalMoves}
                    value={currentIdx}
                    onChange={e => { setIsPlaying(false); setSliderPos(Number(e.target.value) / Math.max(1, totalMoves)); }}
                    className="flex-1 accent-orange-500"
                  />
                  <span className="text-xs text-gray-400 w-24 text-right">
                    {currentIdx.toLocaleString()} / {totalMoves.toLocaleString()}
                  </span>
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
