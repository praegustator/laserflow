import { useEffect } from 'react';

export interface ShortcutDef {
  /** Key to match (e.g. 'z', 's', 'i', 'Delete', 'Escape') */
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  handler: () => void;
  /** Description shown in UI hints */
  label: string;
}

/**
 * Register global keyboard shortcuts.
 * Shortcuts are disabled when the user is focused on an input/textarea/select.
 */
export function useKeyboardShortcuts(shortcuts: ShortcutDef[]) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Skip when typing in form elements
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      for (const s of shortcuts) {
        const ctrlMatch = s.ctrl ? (e.ctrlKey || e.metaKey) : !(e.ctrlKey || e.metaKey);
        const shiftMatch = s.shift ? e.shiftKey : !e.shiftKey;
        // Use exact match for special keys (multi-char), case-insensitive for single chars
        const keyMatch = s.key.length > 1
          ? e.key === s.key
          : e.key.toLowerCase() === s.key.toLowerCase();
        if (keyMatch && ctrlMatch && shiftMatch) {
          e.preventDefault();
          s.handler();
          return;
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shortcuts]);
}
