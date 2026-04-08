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
 */

// ── Configuration ──────────────────────────────────────────────────────────
// Change this if your Laserflow backend runs on a different host or port.
var LASERFLOW_URL = "http://localhost:3001/api/import/svg";

// ── Main ───────────────────────────────────────────────────────────────────
(function () {
  if (!app.documents.length) {
    alert("No document is open.\nPlease open a document first.");
    return;
  }

  var doc = app.activeDocument;
  var docName = doc.name.replace(/\.ai$/i, "");

  // Export SVG to a temporary file
  var tmpFile = new File(Folder.temp.absoluteURI + "/laserflow-export.svg");

  var exportOptions = new ExportOptionsSVG();
  exportOptions.embedRasterImages = true;
  exportOptions.fontSubsetting = SVGFontSubsetting.None;
  exportOptions.coordinatePrecision = 4;
  exportOptions.documentEncoding = SVGDocumentEncoding.UTF8;
  exportOptions.DTD = SVGDTDVersion.SVG1_1;
  exportOptions.cssProperties = SVGCSSPropertyLocation.STYLEATTRIBUTES;

  doc.exportFile(tmpFile, ExportType.SVG, exportOptions);

  // Read the exported SVG content
  var svgContent = readFile(tmpFile);
  tmpFile.remove();

  if (!svgContent) {
    alert("Failed to export SVG.\nPlease try again.");
    return;
  }

  // Send to Laserflow via HTTP POST
  var payload = '{"svg":' + jsonStringEncode(svgContent) + ',"filename":' + jsonStringEncode(docName) + '}';

  var success = httpPost(LASERFLOW_URL, payload);

  if (success) {
    alert("Sent to Laserflow!\n\nThe design \"" + docName + "\" has been imported into your active project.");
  } else {
    alert("Could not reach Laserflow.\n\nMake sure the backend is running at:\n" + LASERFLOW_URL.replace("/api/import/svg", ""));
  }
})();

// ── Helpers ────────────────────────────────────────────────────────────────

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
 * Uses the platform-specific approach available in ExtendScript.
 */
function httpPost(url, jsonBody) {
  // Uses ExtendScript Socket (available on all platforms)
  try {
    var parts = parseUrl(url);
    if (!parts) return false;

    var conn = new Socket();
    conn.timeout = 10;
    if (!conn.open(parts.host + ":" + parts.port)) {
      return false;
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

    // Read response (just check for 200 status)
    var response = conn.read(4096);
    conn.close();

    return response && response.indexOf("200") !== -1;
  } catch (e) {
    return false;
  }
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
