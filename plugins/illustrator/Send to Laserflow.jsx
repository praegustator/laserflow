/**
 * Send to Laserflow — Adobe Illustrator ExtendScript
 *
 * Exports the current Illustrator document (or selection) as SVG and writes
 * it to the Laserflow import inbox directory.  The Laserflow backend watches
 * that directory and picks up new files automatically.
 *
 * Installation:
 *   Copy this file into your Illustrator Scripts folder:
 *     Windows: C:\Program Files\Adobe\Adobe Illustrator <version>\Presets\en_US\Scripts\
 *     macOS:   /Applications/Adobe Illustrator <version>/Presets/en_US/Scripts/
 *   Then restart Illustrator. The script will appear under File → Scripts.
 *
 * Usage:
 *   1. Open or create a document in Illustrator.
 *   2. Make sure Laserflow is running.
 *   3. Run File → Scripts → Send to Laserflow.
 *   4. The design will appear in your active Laserflow project.
 */

// ── Configuration ──────────────────────────────────────────────────────────
// Default inbox directory.  The user can change this in the dialog.
// Must match the backend's import inbox path (configurable in Laserflow
// Settings → Connection → Import Inbox Directory).
var DEFAULT_INBOX = Folder("~").fsName + "/.laserflow/import";

// ── Main ───────────────────────────────────────────────────────────────────
(function () {
  if (!app.documents.length) {
    alert("No document is open.\nPlease open a document first.");
    return;
  }

  var doc = app.activeDocument;
  var hasSelection = doc.selection && doc.selection.length > 0;

  var dialogResult = showDialog(DEFAULT_INBOX, hasSelection);
  if (!dialogResult) return; // user cancelled

  if (dialogResult.mode === "save") {
    saveSvgFile();
    return;
  }

  var inboxPath = dialogResult.inboxPath;
  var docName = doc.name.replace(/\.ai$/i, "");

  var exported;
  if (hasSelection && dialogResult.selectionOnly) {
    exported = exportSelectionAsSvg(doc);
    if (!exported) {
      alert("Failed to export selected objects.\nPlease try again.");
      return;
    }
    docName = docName + " (selection)";
  } else {
    exported = exportDocumentAsSvg(doc);
    if (!exported) {
      alert("Failed to export SVG.\nPlease try again.");
      return;
    }
  }

  var result = fileBasedImport(exported.svg, docName, inboxPath);
  if (result.ok) {
    alert("Sent to Laserflow!\n\n" + result.message);
  } else {
    alert("Could not send to Laserflow.\n\n" + result.error);
  }
})();

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Export SVG to a user-chosen location (fallback).
 * The user can then drag the .svg file into the Laserflow browser window.
 */
function saveSvgFile() {
  var doc = app.activeDocument;
  var docName = doc.name.replace(/\.ai$/i, "");
  var dest = File.saveDialog("Save SVG for Laserflow", "SVG:*.svg");
  if (!dest) return;

  doc.exportFile(dest, ExportType.SVG, buildExportOptions());
  alert("SVG saved!\n\nDrag \"" + dest.name + "\" into the Laserflow\nbrowser window to import it.");
}

/**
 * Build standard ExportOptionsSVG used for both full-doc and selection exports.
 */
function buildExportOptions() {
  var opts = new ExportOptionsSVG();
  opts.embedRasterImages = true;
  opts.fontSubsetting = SVGFontSubsetting.None;
  opts.coordinatePrecision = 4;
  opts.documentEncoding = SVGDocumentEncoding.UTF8;
  opts.DTD = SVGDTDVersion.SVG1_1;
  opts.cssProperties = SVGCSSPropertyLocation.STYLEATTRIBUTES;
  return opts;
}

/**
 * Export the full active document as SVG.
 * Returns { svg: string } with mm-corrected dimensions, or null on failure.
 */
function exportDocumentAsSvg(doc) {
  var tmpFile = new File(Folder.temp.absoluteURI + "/laserflow-export.svg");
  doc.exportFile(tmpFile, ExportType.SVG, buildExportOptions());

  var svgContent = readFile(tmpFile);
  tmpFile.remove();
  if (!svgContent) return null;

  // Get artboard dimensions in mm and inject into the SVG so the parser
  // can correctly scale from viewBox (in points) to millimetres.
  var abIdx = doc.artboards.getActiveArtboardIndex();
  var rect = doc.artboards[abIdx].artboardRect; // [left, top, right, bottom]
  var wMm = (rect[2] - rect[0]) * 25.4 / 72;
  var hMm = (rect[1] - rect[3]) * 25.4 / 72;

  svgContent = fixSvgDimensions(svgContent, wMm, hMm);
  return { svg: svgContent };
}

/**
 * Export only the currently selected objects as SVG.
 *
 * Strategy: duplicate selected items into a brand-new temporary document,
 * export that document as SVG, then close it without saving.  This avoids
 * both clipboard (fails in sandboxed envs) and hide/show (exportFile may
 * still include hidden items in some Illustrator versions).
 *
 * Returns { svg: string } with mm-corrected dimensions, or null on failure.
 */
function exportSelectionAsSvg(doc) {
  var sel = doc.selection;
  if (!sel || sel.length === 0) return null;

  // Compute bounds of selection in points.
  var left = Infinity, top = -Infinity, right = -Infinity, bottom = Infinity;
  for (var i = 0; i < sel.length; i++) {
    var b = sel[i].geometricBounds; // [left, top, right, bottom]
    if (b[0] < left) left = b[0];
    if (b[1] > top) top = b[1];
    if (b[2] > right) right = b[2];
    if (b[3] < bottom) bottom = b[3];
  }
  var wPts = right - left;
  var hPts = top - bottom;

  // Create a temporary document whose artboard matches the selection bounds.
  var tmpDoc = app.documents.add(doc.documentColorSpace, wPts, hPts);

  // Duplicate each selected item into the temp document.
  // Illustrator's duplicate() preserves position, so items land exactly
  // where they were relative to the coordinate system.
  for (var s = 0; s < sel.length; s++) {
    sel[s].duplicate(tmpDoc.layers[0], ElementPlacement.PLACEATEND);
  }

  // Resize artboard to tightly fit the duplicated selection.
  tmpDoc.artboards[0].artboardRect = [left, top, right, bottom];

  // Export the temp doc as SVG.
  var tmpFile = new File(Folder.temp.absoluteURI + "/laserflow-selection.svg");
  var opts = buildExportOptions();
  try { opts.artBoardClipping = true; } catch (ignore) {}
  tmpDoc.exportFile(tmpFile, ExportType.SVG, opts);

  // Close temp doc without saving.
  tmpDoc.close(SaveOptions.DONOTSAVECHANGES);

  // Restore selection in the original doc (closing temp doc changes activeDocument).
  app.activeDocument = doc;
  doc.selection = sel;

  var svgContent = readFile(tmpFile);
  tmpFile.remove();
  if (!svgContent) return null;

  var wMm = wPts * 25.4 / 72;
  var hMm = hPts * 25.4 / 72;
  svgContent = fixSvgDimensions(svgContent, wMm, hMm);

  return { svg: svgContent };
}

/**
 * Ensure the root <svg> element has explicit width/height in mm.
 *
 * Illustrator may or may not include width/height attributes.  If they
 * exist, we replace them.  If they are missing, we add them.  This ensures
 * the Laserflow SVG parser can correctly scale from the viewBox (which
 * Illustrator writes in points) to millimetres.
 *
 * Example: width="28.3465px" -> width="10mm"  (for a 10 mm artboard)
 * Example: <svg viewBox="..."> -> <svg width="10mm" height="10mm" viewBox="...">
 */
function fixSvgDimensions(svgContent, wMm, hMm) {
  var wStr = wMm.toFixed(4) + "mm";
  var hStr = hMm.toFixed(4) + "mm";

  // Locate the opening <svg ...> tag (may span multiple lines).
  var svgStart = svgContent.indexOf("<svg");
  if (svgStart < 0) return svgContent;
  var svgTagEnd = svgContent.indexOf(">", svgStart);
  if (svgTagEnd < 0) return svgContent;

  var before = svgContent.substring(0, svgStart);
  var svgTag = svgContent.substring(svgStart, svgTagEnd + 1);
  var after = svgContent.substring(svgTagEnd + 1);

  // Replace existing width/height or add them if missing.
  // The regex handles optional px/pt/em/% suffixes.
  var hasWidth = /\bwidth\s*=\s*"/.test(svgTag);
  var hasHeight = /\bheight\s*=\s*"/.test(svgTag);

  if (hasWidth) {
    svgTag = svgTag.replace(/\bwidth\s*=\s*"[^"]*"/, 'width="' + wStr + '"');
  }
  if (hasHeight) {
    svgTag = svgTag.replace(/\bheight\s*=\s*"[^"]*"/, 'height="' + hStr + '"');
  }

  // If width/height were missing entirely, inject them after "<svg".
  if (!hasWidth || !hasHeight) {
    var inject = "";
    if (!hasWidth) inject += ' width="' + wStr + '"';
    if (!hasHeight) inject += ' height="' + hStr + '"';
    svgTag = svgTag.replace(/^<svg/, "<svg" + inject);
  }

  return before + svgTag + after;
}

// ── Dialog ─────────────────────────────────────────────────────────────────

/**
 * Show a simple dialog for file-based sending.
 *
 * Returns { mode: "send", inboxPath: string, selectionOnly: boolean }
 *      or { mode: "save" } or null (cancel).
 */
function showDialog(defaultInbox, hasSelection) {
  var dlg = new Window("dialog", "Send to Laserflow");
  dlg.orientation = "column";
  dlg.alignChildren = ["fill", "top"];

  // ── Inbox directory ──
  dlg.add("statictext", undefined, "Laserflow import inbox directory:");
  var pathGroup = dlg.add("group");
  pathGroup.alignChildren = ["fill", "center"];
  var pathInput = pathGroup.add("edittext", undefined, defaultInbox);
  pathInput.characters = 42;
  var browseBtn = pathGroup.add("button", undefined, "Browse\u2026");
  browseBtn.preferredSize = [70, 26];

  browseBtn.onClick = function () {
    var chosen = Folder.selectDialog("Choose Laserflow import inbox directory");
    if (chosen) {
      pathInput.text = chosen.fsName;
    }
  };

  // ── Selection checkbox ──
  var selCheckbox = dlg.add("checkbox", undefined, "Send selected objects only");
  selCheckbox.value = hasSelection;
  selCheckbox.enabled = hasSelection;

  // ── Status area ──
  var statusText = dlg.add("statictext", undefined, "");
  statusText.characters = 50;

  // ── Buttons ──
  var btnRow1 = dlg.add("group");
  btnRow1.alignment = ["center", "top"];
  var sendBtn = btnRow1.add("button", undefined, "Send", { name: "ok" });
  var cancelBtn = btnRow1.add("button", undefined, "Cancel", { name: "cancel" });

  var btnRow2 = dlg.add("group");
  btnRow2.alignment = ["center", "top"];
  var saveBtn = btnRow2.add("button", undefined, "Save SVG File Instead\u2026");

  // Track mode
  var chosenMode = null;

  // Validate inbox on send
  sendBtn.onClick = function () {
    var inbox = new Folder(pathInput.text);
    if (!inbox.exists) {
      // Try to create it
      inbox.create();
    }
    if (!inbox.exists) {
      statusText.text = "\u2718 Directory does not exist and could not be created.";
      return;
    }
    chosenMode = "send";
    dlg.close(1);
  };

  saveBtn.onClick = function () {
    chosenMode = "save";
    dlg.close(2);
  };

  var code = dlg.show();
  if (code === 1 && chosenMode === "send") {
    return { mode: "send", inboxPath: pathInput.text, selectionOnly: selCheckbox.value };
  }
  if (chosenMode === "save") {
    return { mode: "save" };
  }
  return null;
}

// ── File I/O ───────────────────────────────────────────────────────────────

/**
 * Read the full contents of a text file.
 */
function readFile(file) {
  if (!file.open("r")) return null;
  var content = file.read();
  file.close();
  return content;
}

/**
 * JSON-encode a string value (with proper escaping).
 * ExtendScript does not have JSON.stringify, so we do it manually.
 */
function jsonStringEncode(str) {
  var result = '"';
  for (var i = 0; i < str.length; i++) {
    var ch = str.charAt(i);
    var code = str.charCodeAt(i);
    if (ch === '"') result += '\\"';
    else if (ch === "\\") result += "\\\\";
    else if (ch === "\n") result += "\\n";
    else if (ch === "\r") result += "\\r";
    else if (ch === "\t") result += "\\t";
    else if (ch === "\b") result += "\\b";
    else if (ch === "\f") result += "\\f";
    else if (code < 0x20 || code > 0x7e) result += "\\u" + ("0000" + code.toString(16)).slice(-4);
    else result += ch;
  }
  result += '"';
  return result;
}

// ── File-based import ──────────────────────────────────────────────────────

/**
 * Send SVG to Laserflow via the file-based inbox.
 * Writes a JSON file to the inbox directory and waits for the backend
 * to consume it (delete it).
 *
 * Returns { ok: true, message: string } or { ok: false, error: string }.
 */
function fileBasedImport(svgContent, filename, inboxPath) {
  var inbox = new Folder(inboxPath);

  // Create the inbox directory if it doesn't exist
  if (!inbox.exists) {
    inbox.create();
  }

  if (!inbox.exists) {
    return {
      ok: false,
      error: "Could not create import directory:\n" + inbox.fsName +
             "\n\nUse \"Save SVG File Instead\" to export manually."
    };
  }

  // Generate a unique filename using timestamp
  var now = new Date();
  var ts = now.getFullYear() +
    ("0" + (now.getMonth() + 1)).slice(-2) +
    ("0" + now.getDate()).slice(-2) + "-" +
    ("0" + now.getHours()).slice(-2) +
    ("0" + now.getMinutes()).slice(-2) +
    ("0" + now.getSeconds()).slice(-2) + "-" +
    ("00" + now.getMilliseconds()).slice(-3);
  var importFile = new File(inbox.absoluteURI + "/import-" + ts + ".json");

  // Build the JSON payload manually (no JSON.stringify in ES3)
  var payload = '{"svg":' + jsonStringEncode(svgContent) + ',"filename":' + jsonStringEncode(filename) + '}';

  importFile.open("w");
  importFile.write(payload);
  importFile.close();

  if (!importFile.exists) {
    return {
      ok: false,
      error: "Failed to write import file.\n\nUse \"Save SVG File Instead\" to export manually."
    };
  }

  // Wait for the backend to pick up and delete the file (up to 8 seconds).
  var waited = 0;
  var step = 500; // milliseconds
  var maxWait = 8000;
  while (waited < maxWait) {
    $.sleep(step);
    waited += step;
    if (!importFile.exists) {
      // Backend consumed the file — success!
      return {
        ok: true,
        message: "The design \"" + filename + "\" was sent to Laserflow\nvia the local import inbox."
      };
    }
  }

  // File still exists after timeout — backend might not be running.
  // Leave the file so a later backend restart can pick it up.
  return {
    ok: false,
    error: "The import file was written to:\n" + importFile.fsName +
           "\n\nbut Laserflow did not pick it up within " + (maxWait / 1000) +
           " seconds (backend may not be running).\n" +
           "The file will be imported automatically when Laserflow starts."
  };
}
