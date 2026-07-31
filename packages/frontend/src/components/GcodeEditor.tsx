import { useMemo, useRef, useState } from 'react';
import { explainGcodeLine, type GcodeTemplate, type GcodeTokenExplanation } from '../utils/gcodeReference';

const LINE_HEIGHT = 20; // px, matches leading-5

/**
 * Multi-line G-code editor with insertable templates and an
 * Ableton Push-style help panel: moving the cursor over a line (or placing
 * the caret in it) shows an explanation of each command on that line.
 */
export default function GcodeEditor({
  label,
  value,
  onChange,
  templates,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  templates: GcodeTemplate[];
  placeholder?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [activeLine, setActiveLine] = useState<number | null>(null);

  const lines = useMemo(() => value.split('\n'), [value]);
  const explanations: GcodeTokenExplanation[] = useMemo(() => {
    if (activeLine === null || activeLine < 0 || activeLine >= lines.length) return [];
    return explainGcodeLine(lines[activeLine]);
  }, [activeLine, lines]);

  const setLineFromCaret = () => {
    const el = textareaRef.current;
    if (!el) return;
    setActiveLine(value.slice(0, el.selectionStart).split('\n').length - 1);
  };

  const setLineFromMouse = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    const el = textareaRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const y = e.clientY - rect.top - paddingTop + el.scrollTop;
    const line = Math.floor(y / LINE_HEIGHT);
    setActiveLine(line >= 0 && line < lines.length ? line : null);
  };

  const insertTemplate = (tpl: GcodeTemplate) => {
    const trimmed = value.replace(/\s+$/, '');
    onChange(trimmed ? `${trimmed}\n${tpl.gcode}` : tpl.gcode);
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-xs text-gray-500 uppercase">{label}</label>
        <select
          value=""
          onChange={(e) => {
            const tpl = templates[Number(e.target.value)];
            if (tpl) insertTemplate(tpl);
            e.target.value = '';
          }}
          className="bg-gray-900 border border-gray-700 rounded px-2 py-0.5 text-xs text-gray-400 focus:outline-none focus:border-orange-500"
          title="Append a ready-made G-code snippet"
        >
          <option value="" disabled>Insert template…</option>
          {templates.map((tpl, i) => (
            <option key={tpl.name} value={i} title={tpl.description}>{tpl.name}</option>
          ))}
        </select>
      </div>
      <div className="mt-1 flex gap-2 items-stretch">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onClick={setLineFromCaret}
          onKeyUp={setLineFromCaret}
          onMouseMove={setLineFromMouse}
          onMouseLeave={setLineFromCaret}
          placeholder={placeholder}
          rows={4}
          spellCheck={false}
          className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm leading-5 font-mono text-gray-100 focus:outline-none focus:border-orange-500 resize-y"
        />
        {/* Command explanation panel (Ableton Push-style side help) */}
        <div className="w-56 flex-shrink-0 bg-gray-900/70 border border-gray-700 rounded p-2 overflow-auto text-xs">
          {explanations.length > 0 ? (
            <ul className="space-y-1.5">
              {explanations.map((exp, i) => (
                <li key={`${exp.token}-${i}`}>
                  <span className="font-mono text-orange-400">{exp.token}</span>
                  <span className="text-gray-300"> — {exp.name}</span>
                  <p className="text-gray-500 leading-snug">{exp.description}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-600">
              Move the cursor over a G-code line to see what each command does.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
