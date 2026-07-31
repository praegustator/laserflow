/**
 * G-code / GRBL command reference used for inline explanations
 * (hover help) and insertable templates in the custom G-code editors.
 */

export interface GcodeCommandInfo {
  /** Short human name, e.g. "Rapid move". */
  name: string;
  /** One or two sentence explanation of what the command does. */
  description: string;
}

/** Word commands (G/M codes and GRBL $ commands), keyed by normalized token. */
export const GCODE_COMMANDS: Record<string, GcodeCommandInfo> = {
  G0: { name: 'Rapid move', description: 'Move at maximum speed with the laser off. Used for travel moves between shapes.' },
  G1: { name: 'Linear move', description: 'Move in a straight line at the current feed rate (F) with the laser power set by S.' },
  G2: { name: 'Arc move (CW)', description: 'Cut a clockwise arc to the target position. I/J define the arc center offset.' },
  G3: { name: 'Arc move (CCW)', description: 'Cut a counter-clockwise arc to the target position. I/J define the arc center offset.' },
  G4: { name: 'Dwell', description: 'Pause for the number of seconds given by P (e.g. G4 P0.5 waits half a second).' },
  G10: { name: 'Set coordinate data', description: 'Set work coordinate offsets, e.g. G10 L2 P1 X0 Y0 sets the G54 origin.' },
  G17: { name: 'XY plane', description: 'Select the XY plane for arc moves (the default for laser work).' },
  G20: { name: 'Inches mode', description: 'Interpret coordinates and feed rates in inches.' },
  G21: { name: 'Millimeters mode', description: 'Interpret coordinates and feed rates in millimeters (recommended).' },
  G28: { name: 'Go to pre-defined position', description: 'Move to the position stored with G28.1 (often used as a parking position).' },
  G54: { name: 'Work coordinate system 1', description: 'Use the first work coordinate system (default).' },
  G90: { name: 'Absolute positioning', description: 'Coordinates are absolute positions measured from the work origin.' },
  G91: { name: 'Relative positioning', description: 'Coordinates are relative distances from the current position.' },
  G92: { name: 'Set position', description: 'Define the current position as the given coordinates, e.g. G92 X0 Y0 sets the current spot as origin.' },
  M0: { name: 'Program pause', description: 'Pause the job until the user resumes (cycle start).' },
  M2: { name: 'Program end', description: 'End of program. Stops the spindle/laser and resets modal state.' },
  M3: { name: 'Laser on (constant power)', description: 'Turn the laser on at constant power set by S. Used for cutting; power does not vary with speed.' },
  M4: { name: 'Laser on (dynamic power)', description: 'Turn the laser on in dynamic mode: power scales with actual speed to avoid burn-in on acceleration. Used for engraving.' },
  M5: { name: 'Laser off', description: 'Turn the laser off.' },
  M7: { name: 'Mist coolant on', description: 'Turn on mist coolant output (sometimes wired to air assist).' },
  M8: { name: 'Air assist / flood on', description: 'Turn on the flood coolant output — on laser machines this usually switches the air assist pump on.' },
  M9: { name: 'Air assist / coolant off', description: 'Turn off all coolant outputs (air assist off).' },
  M30: { name: 'Program end and rewind', description: 'End of program, same as M2 on GRBL.' },
  $H: { name: 'Homing cycle', description: 'Run the GRBL homing cycle to find the machine origin using the limit switches. Requires homing to be enabled ($22=1).' },
  $X: { name: 'Unlock alarm', description: 'Clear a GRBL alarm state so the machine accepts commands again. Use with care — position may be lost.' },
};

/** Parameter words (letter + value), keyed by the letter. */
export const GCODE_PARAMS: Record<string, GcodeCommandInfo> = {
  X: { name: 'X coordinate', description: 'Target position or distance along the X axis.' },
  Y: { name: 'Y coordinate', description: 'Target position or distance along the Y axis.' },
  Z: { name: 'Z coordinate', description: 'Target position or distance along the Z axis (focus height).' },
  I: { name: 'Arc center X offset', description: 'X offset from the current position to the arc center (used with G2/G3).' },
  J: { name: 'Arc center Y offset', description: 'Y offset from the current position to the arc center (used with G2/G3).' },
  F: { name: 'Feed rate', description: 'Movement speed for G1/G2/G3 moves, in mm/min (with G21).' },
  S: { name: 'Laser power', description: 'Laser power value from 0 up to the machine maximum ($30). Effective with M3/M4.' },
  P: { name: 'Parameter / time', description: 'Auxiliary value — for G4 it is the dwell time in seconds.' },
  L: { name: 'L parameter', description: 'Sub-mode selector for commands like G10.' },
};

export interface GcodeTokenExplanation {
  token: string;
  name: string;
  description: string;
}

/**
 * Break a G-code line into tokens and explain each recognized one.
 * Comments (after ';' or in parentheses) are reported as a single token.
 */
export function explainGcodeLine(line: string): GcodeTokenExplanation[] {
  const result: GcodeTokenExplanation[] = [];
  let code = line;

  const semi = code.indexOf(';');
  if (semi !== -1) {
    code = code.slice(0, semi);
    result.push({ token: line.slice(semi), name: 'Comment', description: 'Ignored by the machine. Use comments to document your G-code.' });
  }
  code = code.replace(/\([^)]*\)/g, ' ');

  const trimmed = code.trim();
  if (trimmed.startsWith('$')) {
    const cmd = trimmed.split(/\s+/)[0].toUpperCase();
    const info = GCODE_COMMANDS[cmd];
    result.unshift(info
      ? { token: cmd, ...info }
      : { token: cmd, name: 'GRBL system command', description: 'Machine-level GRBL command (settings, homing, unlock, …).' });
    return result;
  }

  const tokens = trimmed.match(/[A-Za-z][+-]?\d*\.?\d*/g) ?? [];
  const explained: GcodeTokenExplanation[] = [];
  for (const raw of tokens) {
    const letter = raw[0].toUpperCase();
    const value = raw.slice(1);
    if ((letter === 'G' || letter === 'M') && value !== '') {
      const key = `${letter}${parseFloat(value)}`;
      const info = GCODE_COMMANDS[key];
      explained.push(info
        ? { token: raw.toUpperCase(), ...info }
        : { token: raw.toUpperCase(), name: `Unknown ${letter}-code`, description: 'Not a standard GRBL command — check your machine documentation.' });
    } else if (GCODE_PARAMS[letter]) {
      explained.push({ token: raw.toUpperCase(), ...GCODE_PARAMS[letter] });
    }
  }
  return [...explained, ...result];
}

export interface GcodeTemplate {
  name: string;
  description: string;
  gcode: string;
}

/** Ready-made snippets users can insert into the custom start G-code field. */
export const START_GCODE_TEMPLATES: GcodeTemplate[] = [
  {
    name: 'Home machine',
    description: 'Run the homing cycle so every job starts from a known position.',
    gcode: '$H ; home the machine',
  },
  {
    name: 'Air assist on',
    description: 'Switch the air assist pump on before the job starts.',
    gcode: 'M8 ; air assist on',
  },
  {
    name: 'Home + air assist',
    description: 'Home the machine, turn air assist on and wait a second for pressure to build.',
    gcode: '$H ; home the machine\nM8 ; air assist on\nG4 P1 ; wait 1 second',
  },
  {
    name: 'Set current position as origin',
    description: 'Use the current laser position as the job origin (useful without homing switches).',
    gcode: 'G92 X0 Y0 ; current position becomes origin',
  },
];

/** Ready-made snippets users can insert into the custom end G-code field. */
export const END_GCODE_TEMPLATES: GcodeTemplate[] = [
  {
    name: 'Air assist off',
    description: 'Switch the air assist pump off when the job finishes.',
    gcode: 'M9 ; air assist off',
  },
  {
    name: 'Park at back',
    description: 'Move the head out of the way so the finished piece is easy to remove.',
    gcode: 'G0 X0 Y190 ; park head at the back (adjust Y to your machine)',
  },
  {
    name: 'Cool-down pause',
    description: 'Keep the air assist running for a few seconds after the job, then turn it off.',
    gcode: 'G4 P5 ; let air run 5 seconds\nM9 ; air assist off',
  },
  {
    name: 'End program',
    description: 'Explicit program end for controllers that expect it.',
    gcode: 'M2 ; program end',
  },
];
