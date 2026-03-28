/**
 * GRBL error and alarm code lookup tables.
 * Sources: https://github.com/gnea/grbl/blob/master/doc/csv/error_codes_en_US.csv
 *          https://github.com/gnea/grbl/blob/master/doc/csv/alarm_codes_en_US.csv
 */

export const GRBL_ERROR_CODES: Record<string, string> = {
  '1': 'G-code words consist of a letter and a value. Letter was not found.',
  '2': 'Numeric value format is not valid or missing an expected value.',
  '3': "Grbl '$' system command was not recognized or supported.",
  '4': 'Negative value received for an expected positive value.',
  '5': 'Homing cycle is not enabled via settings.',
  '6': 'Minimum step pulse time must be greater than 3 microseconds.',
  '7': 'EEPROM read failed. Reset and restored to default values.',
  '8': "Grbl '$' command cannot be used unless Grbl is IDLE. Ensure no G-code motion is active.",
  '9': 'G-code locked out during alarm or jog state.',
  '10': 'Soft limits cannot be enabled without homing also enabled.',
  '11': 'Max characters per line exceeded. Line was not processed and executed.',
  '12': "Grbl '$' setting value cause the step rate to exceed the maximum supported.",
  '13': 'Safety door detected as opened and door state initiated.',
  '14': 'Build info or startup line exceeded EEPROM line length limit.',
  '15': 'Jog target exceeds machine travel. Command ignored.',
  '16': "Jog command with no '=' or contains prohibited g-code.",
  '17': 'Laser mode requires PWM output.',
  '20': 'Unsupported or invalid g-code command found in block.',
  '21': 'More than one g-code command from same modal group found in block.',
  '22': 'Feed rate has not yet been set or is undefined.',
  '23': 'G-code command in block requires an integer value.',
  '24': 'Two G-code commands that both require the use of the XYZ axis words were detected in the block.',
  '25': 'A G-code word was repeated in the block.',
  '26': 'A G-code command implicitly or explicitly requires XYZ axis words in the block, but none were detected.',
  '27': 'N line number value is not within the valid range of 1–9,999,999.',
  '28': 'A G-code command was sent, but is missing some required P or L value words in the line.',
  '29': 'Grbl supports six work coordinate systems G54–G59. G59.1, G59.2, and G59.3 are not supported.',
  '30': 'The G53 G-code command requires either a G0 seek or G1 feed motion mode to be active. A different motion was active.',
  '31': 'There are unused axis words in the block and G80 motion mode cancel is active.',
  '32': 'A G2 or G3 arc was detected and the arc is missing the required plane axis word(s) and/or optional parameter word(s).',
  '33': 'The motion command has an invalid target. G2, G3, and G38.2 generate this error.',
  '34': 'A G2 or G3 arc, when converted from radius form to center-arc form, is either too small or too large.',
  '35': 'Target of G38.2 arc is less than 0.002 mm from the current position.',
  '36': 'A G38.2 probe cycle failed to trigger the probe within the machine travels. Try again with a slower feed or a larger travel.',
  '37': 'Spindle speed max and min are configured backwards. Max must be larger than min.',
  '38': 'An EEPROM read of a settings address generated a checksum error.',
  '39': "Grbl '$' command requires an '$=' assignment.",
  '40': 'G-code motion type command missing in block.',
  '41': 'G-code axis command missing in block.',
};

export const GRBL_ALARM_CODES: Record<string, string> = {
  '1': 'Hard limit triggered. Machine position is likely lost due to sudden and immediate halt. Re-homing is highly recommended.',
  '2': 'G-code motion target exceeds machine travel. Machine position safely retained. Alarm may be unlocked.',
  '3': 'Reset while in motion. Grbl cannot guarantee position. Lost steps are likely. Re-homing is highly recommended.',
  '4': 'Probe fail. The probe is not in the expected initial state before starting probe cycle.',
  '5': 'Probe fail. Probe did not contact the workpiece within the programmed travel.',
  '6': 'Homing fail. Reset during active homing cycle.',
  '7': 'Homing fail. Safety door was opened during active homing cycle.',
  '8': 'Homing fail. Cycle failed to clear limit switch when pulling off. Try increasing pull-off setting or check limit switch wiring.',
  '9': 'Homing fail. Could not find limit switch within search distance.',
};

/**
 * Returns a human-readable description for a GRBL error line (e.g. "error:24").
 * Returns undefined if the line is not a recognized error/alarm or if the code is unknown.
 */
export function grblErrorDescription(line: string): string | undefined {
  if (line.startsWith('error:')) {
    const code = line.slice(6).trim();
    return GRBL_ERROR_CODES[code];
  }
  if (line.startsWith('ALARM:')) {
    const code = line.slice(6).trim();
    return GRBL_ALARM_CODES[code];
  }
  return undefined;
}
