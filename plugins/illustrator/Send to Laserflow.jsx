/**
 * Send to Laserflow — Adobe Illustrator ExtendScript
 *
 * Exports the current Illustrator document as SVG and sends it to a running
 * Laserflow instance so the design is immediately available in the editor.
 *
 * Installation:
 *   Copy this file into your Illustrator Scripts folder:
 *     Windows: C:\Program Files\Adobe\Adobe Illustrator <version>\Presets\en_US\Scripts\
 *     macOS:   /Applications/Adobe Illustrator <version>/Presets/en_US/Scripts/
 *   Then restart Illustrator. The script will appear under File → Scripts.
 *
 * Usage:
 *   1. Open or create a document in Illustrator.
 *   2. Make sure Laserflow is running (default: http://localhost:3001).
 *   3. Run File → Scripts → Send to Laserflow.
 *   4. The design will appear in your active Laserflow project.
 *
 * If networking fails, use "Save SVG File" to export manually,
 * then drag the file into the Laserflow browser window.
 */

// ── Configuration ──────────────────────────────────────────────────────────
// Change this if your Laserflow backend runs on a different host or port.
var LASERFLOW_URL = "http://127.0.0.1:3001/api/import/svg";

// ── Main ───────────────────────────────────────────────────────────────────
(function () {
  if (!app.documents.length) {
    alert("No document is open.\nPlease open a document first.");
    return;
  }

  // Show connection dialog so the user can confirm / change the URL
  var dialogResult = showConnectionDialog(LASERFLOW_URL);
  if (!dialogResult) return; // user cancelled

  // "save" mode — user clicked Save SVG File
  if (dialogResult.mode === "save") {
    saveSvgFile();
    return;
  }

  var targetUrl = dialogResult.url;
  var doc = app.activeDocument;
  var docName = doc.name.replace(/\.ai$/i, "");
  var hasSelection = doc.selection && doc.selection.length > 0;

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

  var svgContent = exported.svg;

  // Send to Laserflow via HTTP POST
  var payload = '{"svg":' + jsonStringEncode(svgContent) + ',"filename":' + jsonStringEncode(docName) + '}';

  var result = httpPost(targetUrl, payload);

  if (result.ok) {
    alert("Sent to Laserflow!\n\nThe design \"" + docName + "\" has been imported into your active project.");
    return;
  }

  // HTTP failed — try file-based import as a fallback.
  // The Laserflow backend watches ~/.laserflow/import/ for JSON files.
  var fileResult = fileBasedImport(svgContent, docName);
  if (fileResult.ok) {
    alert("Sent to Laserflow!\n\n" + fileResult.message);
  } else {
    alert("Could not reach Laserflow.\n\n" + result.error + "\n\n" + fileResult.error);
  }
})();

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Export SVG to a user-chosen location (fallback when networking fails).
 * The user can then drag the .svg file into the Laserflow browser window.
 */
function saveSvgFile() {
  var doc = app.activeDocument;
  var docName = doc.name.replace(/\.ai$/i, "");
  var dest = File.saveDialog("Save SVG for Laserflow", "SVG:*.svg");
  if (!dest) return;

  var exportOptions = new ExportOptionsSVG();
  exportOptions.embedRasterImages = true;
  exportOptions.fontSubsetting = SVGFontSubsetting.None;
  exportOptions.coordinatePrecision = 4;
  exportOptions.documentEncoding = SVGDocumentEncoding.UTF8;
  exportOptions.DTD = SVGDTDVersion.SVG1_1;
  exportOptions.cssProperties = SVGCSSPropertyLocation.STYLEATTRIBUTES;

  doc.exportFile(dest, ExportType.SVG, exportOptions);

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
 * Copies the selection into a temporary document, exports, then cleans up.
 * Returns { svg: string } with mm-corrected dimensions, or null on failure.
 */
function exportSelectionAsSvg(doc) {
  var sel = doc.selection;
  if (!sel || sel.length === 0) return null;

  // Compute the geometric bounds of all selected items (in points).
  // Illustrator bounds: [left, top, right, bottom] where top > bottom.
  var left = Infinity, top = -Infinity, right = -Infinity, bottom = Infinity;
  for (var i = 0; i < sel.length; i++) {
    var b = sel[i].geometricBounds;
    if (b[0] < left) left = b[0];
    if (b[1] > top) top = b[1];
    if (b[2] > right) right = b[2];
    if (b[3] < bottom) bottom = b[3];
  }
  var wPts = right - left;
  var hPts = top - bottom;

  // Copy selected items to the clipboard
  app.copy();

  // Create a temporary document with the same colour space
  var cs = doc.documentColorSpace;
  var tmpDoc = app.documents.add(cs, wPts, hPts);

  // Set the artboard to match the original selection bounds so that
  // "Paste in Front" places items at their original coordinates.
  tmpDoc.artboards[0].artboardRect = [left, top, right, bottom];

  // Paste in front preserves the original x/y position of copied items.
  app.executeMenuCommand("pasteInFront");

  // Export SVG (clipped to the artboard)
  var exportOptions = buildExportOptions();
  try { exportOptions.artBoardClipping = true; } catch (ignore) {}

  var tmpFile = new File(Folder.temp.absoluteURI + "/laserflow-selection.svg");
  tmpDoc.exportFile(tmpFile, ExportType.SVG, exportOptions);

  var svgContent = readFile(tmpFile);
  tmpFile.remove();
  tmpDoc.close(SaveOptions.DONOTSAVECHANGES);

  if (!svgContent) return null;

  // Inject mm dimensions
  var wMm = wPts * 25.4 / 72;
  var hMm = hPts * 25.4 / 72;
  svgContent = fixSvgDimensions(svgContent, wMm, hMm);

  return { svg: svgContent };
}

/**
 * Replace the width/height attributes in the root <svg> element with
 * explicit mm values.  This ensures the Laserflow SVG parser can compute
 * the correct scale from the viewBox (which Illustrator writes in points)
 * to millimetres.
 *
 * Example: width="28.3465" → width="10mm"  (for a 10 mm artboard)
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

  // Replace existing width/height (with or without px/pt suffix)
  svgTag = svgTag.replace(/width="[\d.]+(px|pt)?"/, 'width="' + wStr + '"');
  svgTag = svgTag.replace(/height="[\d.]+(px|pt)?"/, 'height="' + hStr + '"');

  return before + svgTag + after;
}

/**
 * Show a dialog that lets the user confirm or change the Laserflow URL,
 * test the connection (with diagnostic log), or save an SVG file instead.
 *
 * Returns { mode: "send", url: string, selectionOnly: boolean }
 *      or { mode: "save" } or null (cancel).
 */
function showConnectionDialog(defaultUrl) {
  var dlg = new Window("dialog", "Send to Laserflow");

  dlg.orientation = "column";
  dlg.alignChildren = ["fill", "top"];

  dlg.add("statictext", undefined, "Laserflow backend URL:");
  var urlInput = dlg.add("edittext", undefined, defaultUrl);
  urlInput.characters = 45;

  // "Selection only" checkbox — enabled only when there is a selection
  var hasSelection = app.activeDocument && app.activeDocument.selection &&
                     app.activeDocument.selection.length > 0;
  var selCheckbox = dlg.add("checkbox", undefined, "Send selected objects only");
  selCheckbox.value = hasSelection; // default to on when there is a selection
  selCheckbox.enabled = hasSelection;

  var statusText = dlg.add("statictext", undefined, "Click Test Connection to verify.");
  statusText.characters = 45;

  // Scrollable diagnostic log area
  dlg.add("statictext", undefined, "Diagnostic log:");
  var logBox = dlg.add("edittext", undefined, "", { multiline: true, readonly: true, scrolling: true });
  logBox.characters = 45;
  logBox.minimumSize = [0, 100];

  var btnRow1 = dlg.add("group");
  btnRow1.alignment = ["center", "top"];
  var testBtn = btnRow1.add("button", undefined, "Test Connection");
  var sendBtn = btnRow1.add("button", undefined, "Send", { name: "ok" });
  var cancelBtn = btnRow1.add("button", undefined, "Cancel", { name: "cancel" });

  var btnRow2 = dlg.add("group");
  btnRow2.alignment = ["center", "top"];
  var saveBtn = btnRow2.add("button", undefined, "Save SVG File Instead\u2026");

  sendBtn.enabled = false;

  // Track whether user clicked Save SVG
  var chosenMode = null;

  function addLog(msg) {
    if (logBox.text) {
      logBox.text += "\n" + msg;
    } else {
      logBox.text = msg;
    }
    dlg.update();
  }

  testBtn.onClick = function () {
    logBox.text = "";
    statusText.text = "Connecting\u2026";
    dlg.update();

    var parts = parseUrl(urlInput.text);
    if (!parts) {
      statusText.text = "\u2718 Invalid URL";
      addLog("ERROR: Could not parse URL: " + urlInput.text);
      sendBtn.enabled = false;
      return;
    }
    addLog("Parsed: host=" + parts.host + " port=" + parts.port + " path=" + parts.path);

    var result = testConnection(parts.host, parts.port, addLog);
    if (result) {
      statusText.text = "\u2714 Connected to " + parts.host + ":" + parts.port;
      sendBtn.enabled = true;
    } else {
      // All HTTP methods failed — check file-based import availability
      var inboxOk = testFileBasedImport(addLog);
      if (inboxOk) {
        statusText.text = "\u2714 File-based import available (HTTP failed)";
        sendBtn.enabled = true;
      } else {
        statusText.text = "\u2718 Cannot connect to " + parts.host + ":" + parts.port;
        sendBtn.enabled = false;
      }
    }
  };

  saveBtn.onClick = function () {
    chosenMode = "save";
    dlg.close(2);
  };

  var code = dlg.show();
  if (code === 1) {
    return { mode: "send", url: urlInput.text, selectionOnly: selCheckbox.value };
  }
  if (chosenMode === "save") {
    return { mode: "save" };
  }
  return null;
}

/**
 * Test whether the Laserflow backend is reachable.
 * Tries multiple methods and logs diagnostics via the addLog callback.
 * Returns true if any method gets an HTTP 200.
 */
function testConnection(host, port, addLog) {
  var url = "http://" + host + ":" + port + "/api/version";
  var tmpOut = new File(Folder.temp.absoluteURI + "/laserflow-curl-test.txt");

  // ── Environment info ──
  addLog("OS: " + $.os);
  addLog("ExtendScript build: " + $.build);
  addLog("system object: " + (typeof system));
  if (typeof system !== "undefined") {
    addLog("system.callSystem: " + (typeof system.callSystem));
  }
  addLog("app.system: " + (typeof app.system));
  addLog("Socket: " + (typeof Socket));

  // ── Method 1: system.callSystem with curl (stdout capture) ──
  try {
    if (typeof system !== "undefined" && typeof system.callSystem === "function") {
      addLog("\n--- Method 1: system.callSystem (curl stdout) ---");
      var cmd1 = "curl -s -o /dev/null -w \"%{http_code}\" --connect-timeout 5 \"" + url + "\"";
      addLog("cmd: " + cmd1);
      var code1 = system.callSystem(cmd1);
      addLog("result: " + String(code1));
      if (code1 !== null && code1 !== undefined) {
        var trimmed = String(code1).replace(/\s/g, "");
        addLog("trimmed: [" + trimmed + "]");
        if (trimmed === "200") {
          addLog("SUCCESS via system.callSystem");
          return true;
        }
      }
    } else {
      addLog("\nsystem.callSystem not available, skipping Method 1");
    }
  } catch (e1) {
    addLog("Method 1 exception: " + e1.message);
  }

  // ── Method 2: system.callSystem with curl writing to a temp file ──
  try {
    if (typeof system !== "undefined" && typeof system.callSystem === "function") {
      addLog("\n--- Method 2: system.callSystem (curl -> file) ---");
      var cmd2 = "curl -s -w \"\\n%{http_code}\" --connect-timeout 5 \"" + url + "\" > \"" + tmpOut.fsName + "\" 2>&1";
      addLog("cmd: " + cmd2);
      system.callSystem(cmd2);
      var out2 = readFile(tmpOut);
      tmpOut.remove();
      addLog("file content: " + (out2 ? out2.substring(0, 200) : "(empty)"));
      if (out2 && out2.indexOf("200") !== -1) {
        addLog("SUCCESS via system.callSystem + file");
        return true;
      }
    }
  } catch (e2) {
    addLog("Method 2 exception: " + e2.message);
  }

  // ── Method 3: app.system (macOS/Windows) ──
  try {
    if (typeof app.system === "function") {
      addLog("\n--- Method 3: app.system (curl -> file) ---");
      var cmd3 = "curl -s -w \"\\n%{http_code}\" --connect-timeout 5 \"" + url + "\" > \"" + tmpOut.fsName + "\" 2>&1";
      addLog("cmd: " + cmd3);
      app.system(cmd3);
      var out3 = readFile(tmpOut);
      tmpOut.remove();
      addLog("file content: " + (out3 ? out3.substring(0, 200) : "(empty)"));
      if (out3 && out3.indexOf("200") !== -1) {
        addLog("SUCCESS via app.system + file");
        return true;
      }
    } else {
      addLog("\napp.system not available, skipping Method 3");
    }
  } catch (e3) {
    addLog("Method 3 exception: " + e3.message);
  }

  // ── Method 4: ExtendScript Socket ──
  try {
    addLog("\n--- Method 4: ExtendScript Socket ---");
    var conn = new Socket();
    conn.timeout = 5;
    addLog("Socket.open(\"" + host + ":" + port + "\")");
    var opened = conn.open(host + ":" + port);
    addLog("open returned: " + opened);
    if (opened) {
      var request =
        "GET /api/version HTTP/1.1\r\n" +
        "Host: " + host + "\r\n" +
        "Connection: close\r\n" +
        "\r\n";
      conn.write(request);
      var response = conn.read(1024);
      conn.close();
      addLog("response: " + (response ? response.substring(0, 120) : "(empty)"));
      if (response && response.indexOf("200") !== -1) {
        addLog("SUCCESS via Socket");
        return true;
      }
    } else {
      addLog("Socket.open failed (returned false)");
      addLog("Socket.error: " + conn.error);
    }
  } catch (e4) {
    addLog("Method 4 exception: " + e4.message);
  }

  addLog("\nAll HTTP methods failed.");
  return false;
}

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

/**
 * Send an HTTP POST request with a JSON body.
 * Tries (in order): system.callSystem, app.system, then Socket fallback.
 * Returns { ok: true } on success or { ok: false, error: string } on failure.
 */
function httpPost(url, jsonBody) {
  var parts = parseUrl(url);
  if (!parts) return { ok: false, error: "Invalid URL: " + url };

  // Write payload to a temp file (used by curl methods)
  var tmpPayload = new File(Folder.temp.absoluteURI + "/laserflow-payload.json");
  var tmpOut = new File(Folder.temp.absoluteURI + "/laserflow-post-result.txt");

  tmpPayload.open("w");
  tmpPayload.write(jsonBody);
  tmpPayload.close();

  var curlCmd =
    "curl -s -w \"\\n%{http_code}\" --connect-timeout 10 " +
    "-X POST -H \"Content-Type: application/json\" " +
    "-d @\"" + tmpPayload.fsName + "\" " +
    "\"" + url + "\"";

  // ── Method 1: system.callSystem (stdout capture) ──
  try {
    if (typeof system !== "undefined" && typeof system.callSystem === "function") {
      var raw1 = system.callSystem(curlCmd);
      tmpPayload.remove();
      if (raw1 !== null && raw1 !== undefined) {
        var result1 = parseCurlResult(String(raw1), parts);
        if (result1) return result1;
      }
    }
  } catch (ignore) {}

  // ── Method 2: system.callSystem (curl -> file) ──
  try {
    if (typeof system !== "undefined" && typeof system.callSystem === "function") {
      system.callSystem(curlCmd + " > \"" + tmpOut.fsName + "\" 2>&1");
      if (tmpPayload.exists) tmpPayload.remove();
      var raw2 = readFile(tmpOut);
      tmpOut.remove();
      if (raw2) {
        var result2 = parseCurlResult(raw2, parts);
        if (result2) return result2;
      }
    }
  } catch (ignore) {}

  // ── Method 3: app.system (curl -> file) ──
  try {
    if (typeof app.system === "function") {
      app.system(curlCmd + " > \"" + tmpOut.fsName + "\" 2>&1");
      if (tmpPayload.exists) tmpPayload.remove();
      var raw3 = readFile(tmpOut);
      tmpOut.remove();
      if (raw3) {
        var result3 = parseCurlResult(raw3, parts);
        if (result3) return result3;
      }
    }
  } catch (ignore) {}

  // Clean up temp files
  if (tmpPayload.exists) tmpPayload.remove();
  if (tmpOut.exists) tmpOut.remove();

  // ── Method 4: ExtendScript Socket ──
  try {
    var conn = new Socket();
    conn.timeout = 10;
    if (!conn.open(parts.host + ":" + parts.port)) {
      return {
        ok: false,
        error: "All HTTP methods failed.\n\n" +
               "Make sure Laserflow is running at " + parts.host + ":" + parts.port + "."
      };
    }

    // jsonBody is pure ASCII (non-ASCII escaped to \uXXXX) so
    // .length equals byte length regardless of Socket encoding.
    var request =
      "POST " + parts.path + " HTTP/1.1\r\n" +
      "Host: " + parts.host + "\r\n" +
      "Content-Type: application/json\r\n" +
      "Content-Length: " + jsonBody.length + "\r\n" +
      "Connection: close\r\n" +
      "\r\n" +
      jsonBody;

    conn.write(request);

    // Read response
    var response = conn.read(4096);
    conn.close();

    if (!response) {
      return { ok: false, error: "No response from server." };
    }
    if (response.indexOf("200") !== -1) {
      return { ok: true };
    }
    var bodyStart = response.indexOf("\r\n\r\n");
    var respBody = bodyStart !== -1 ? response.substring(bodyStart + 4) : response;
    return { ok: false, error: "Server responded with an error:\n" + respBody.substring(0, 200) };
  } catch (e) {
    return {
      ok: false,
      error: "All HTTP methods failed.\n(system.callSystem, app.system, and Socket unavailable)"
    };
  }
}

/**
 * Parse the output of a curl -w "\n%{http_code}" call.
 * Returns {ok:true}, {ok:false, error:...}, or null if output is unusable.
 */
function parseCurlResult(raw, parts) {
  raw = raw.replace(/\s+$/, "");
  var lastNl = raw.lastIndexOf("\n");
  var statusCode = lastNl >= 0 ? raw.substring(lastNl + 1) : raw;
  statusCode = statusCode.replace(/\s/g, "");

  if (statusCode === "200") {
    return { ok: true };
  }
  if (statusCode === "000" || statusCode === "") {
    // curl couldn't connect — don't return yet, let caller try next method
    return null;
  }
  var body = lastNl >= 0 ? raw.substring(0, lastNl) : "";
  return {
    ok: false,
    error: "Server responded with HTTP " + statusCode +
           (body ? ":\n" + body.substring(0, 200) : "")
  };
}

/**
 * Parse a URL into host, port, and path components.
 */
function parseUrl(url) {
  // ExtendScript (ES3) does not support non-capturing groups (?:),
  // so we use normal capturing groups and adjust indices.
  var match = url.match(/^https?:\/\/([^\/:]+)(:(\d+))?(\/.*)?$/);
  if (!match) return null;
  return {
    host: match[1],
    port: match[3] ? parseInt(match[3], 10) : 80,
    path: match[4] || "/",
  };
}

// ── File-based import ──────────────────────────────────────────────────────
// When HTTP is impossible (no system.callSystem, no Socket), the plugin
// writes a JSON file to ~/.laserflow/import/ and the Laserflow backend
// (running on the same machine) picks it up automatically.

/**
 * Return the path to the Laserflow import inbox directory.
 * On macOS: /Users/<name>/.laserflow/import
 * On Windows: C:\Users\<name>\.laserflow\import
 */
function getInboxFolder() {
  var home = Folder("~");
  return new Folder(home.absoluteURI + "/.laserflow/import");
}

/**
 * Check if the Laserflow backend's file-based import inbox is available.
 * The backend writes a sentinel file (.laserflow-server) when it starts.
 * Logs diagnostics via addLog callback.
 */
function testFileBasedImport(addLog) {
  addLog("\n--- File-based import check ---");
  var inbox = getInboxFolder();
  addLog("Inbox path: " + inbox.fsName);

  if (!inbox.exists) {
    addLog("Inbox directory does not exist.");
    addLog("If Laserflow is running on this Mac,");
    addLog("it should create ~/.laserflow/import/ at startup.");
    return false;
  }

  var sentinel = new File(inbox.absoluteURI + "/.laserflow-server");
  addLog("Sentinel file: " + sentinel.fsName);
  if (!sentinel.exists) {
    addLog("Sentinel file not found.");
    addLog("The inbox directory exists but Laserflow may not be running.");
    return false;
  }

  // Read sentinel to show diagnostic info
  var sentinelData = readFile(sentinel);
  if (sentinelData) {
    addLog("Sentinel: " + sentinelData.substring(0, 200));
  }

  addLog("SUCCESS: file-based import available.");
  addLog("SVG files will be written to the inbox directory");
  addLog("and picked up automatically by Laserflow.");
  return true;
}

/**
 * Send SVG to Laserflow via the file-based inbox.
 * Writes a JSON file to ~/.laserflow/import/ and waits for the backend
 * to consume it (delete it).
 *
 * Returns { ok: true, message: string } or { ok: false, error: string }.
 */
function fileBasedImport(svgContent, filename) {
  var inbox = getInboxFolder();

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

  // File still exists after timeout — backend might not be running
  // Leave the file so a later backend restart can pick it up.
  return {
    ok: false,
    error: "Import file was written to:\n" + importFile.fsName +
           "\n\nbut Laserflow did not pick it up within " + (maxWait / 1000) + " seconds.\n" +
           "Make sure the Laserflow backend is running.\n" +
           "The file will be imported automatically when it starts."
  };
}
