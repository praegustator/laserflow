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
var LASERFLOW_URL = "http://127.0.0.1:3001/api/import/svg";

// ── Main ───────────────────────────────────────────────────────────────────
(function () {
  if (!app.documents.length) {
    alert("No document is open.\nPlease open a document first.");
    return;
  }

  // Show connection dialog so the user can confirm / change the URL
  var targetUrl = showConnectionDialog(LASERFLOW_URL);
  if (!targetUrl) return; // user cancelled

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

  var result = httpPost(targetUrl, payload);

  if (result.ok) {
    alert("Sent to Laserflow!\n\nThe design \"" + docName + "\" has been imported into your active project.");
  } else {
    alert("Could not reach Laserflow.\n\n" + result.error);
  }
})();

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Show a dialog that lets the user confirm or change the Laserflow URL
 * and test the connection before sending.
 * Returns the URL string, or null if the user cancelled.
 */
function showConnectionDialog(defaultUrl) {
  var dlg = new Window("dialog", "Send to Laserflow");

  dlg.orientation = "column";
  dlg.alignChildren = ["fill", "top"];

  dlg.add("statictext", undefined, "Laserflow backend URL:");
  var urlInput = dlg.add("edittext", undefined, defaultUrl);
  urlInput.characters = 40;

  var statusText = dlg.add("statictext", undefined, "");
  statusText.characters = 40;

  var btnGroup = dlg.add("group");
  btnGroup.alignment = ["center", "top"];

  var testBtn = btnGroup.add("button", undefined, "Test Connection");
  var sendBtn = btnGroup.add("button", undefined, "Send", { name: "ok" });
  var cancelBtn = btnGroup.add("button", undefined, "Cancel", { name: "cancel" });

  sendBtn.enabled = false;

  testBtn.onClick = function () {
    statusText.text = "Connecting\u2026";
    dlg.update();
    var parts = parseUrl(urlInput.text);
    if (!parts) {
      statusText.text = "\u2718 Invalid URL";
      sendBtn.enabled = false;
      return;
    }
    var ping = testConnection(parts.host, parts.port);
    if (ping) {
      statusText.text = "\u2714 Connected to " + parts.host + ":" + parts.port;
      sendBtn.enabled = true;
    } else {
      statusText.text = "\u2718 Cannot connect to " + parts.host + ":" + parts.port;
      sendBtn.enabled = false;
    }
  };

  // Auto-test on open
  testBtn.notify("onClick");

  if (dlg.show() === 1) {
    return urlInput.text;
  }
  return null;
}

/**
 * Test whether we can open a TCP connection to the given host and port.
 */
function testConnection(host, port) {
  try {
    var conn = new Socket();
    conn.timeout = 5;
    if (!conn.open(host + ":" + port)) {
      return false;
    }
    conn.close();
    return true;
  } catch (e) {
    return false;
  }
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
 * Uses the platform-specific approach available in ExtendScript.
 */
function httpPost(url, jsonBody) {
  // Uses ExtendScript Socket (available on all platforms)
  var parts = parseUrl(url);
  if (!parts) return { ok: false, error: "Invalid URL: " + url };

  try {
    var conn = new Socket();
    conn.timeout = 10;
    if (!conn.open(parts.host + ":" + parts.port)) {
      return {
        ok: false,
        error: "Could not open connection to " + parts.host + ":" + parts.port +
               "\n\nMake sure Laserflow is running.\nIf it is, try changing the URL to use 127.0.0.1 or your machine\u2019s IP address."
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
    // Try to extract a useful message from the HTTP response body
    var bodyStart = response.indexOf("\r\n\r\n");
    var body = bodyStart !== -1 ? response.substring(bodyStart + 4) : response;
    return { ok: false, error: "Server responded with an error:\n" + body.substring(0, 200) };
  } catch (e) {
    return { ok: false, error: "Exception: " + e.message };
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
