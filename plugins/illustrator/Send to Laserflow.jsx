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
 * Show a dialog that lets the user confirm or change the Laserflow URL,
 * test the connection (with diagnostic log), or save an SVG file instead.
 *
 * Returns { mode: "send", url: string } or { mode: "save" } or null (cancel).
 */
function showConnectionDialog(defaultUrl) {
  var dlg = new Window("dialog", "Send to Laserflow");

  dlg.orientation = "column";
  dlg.alignChildren = ["fill", "top"];

  dlg.add("statictext", undefined, "Laserflow backend URL:");
  var urlInput = dlg.add("edittext", undefined, defaultUrl);
  urlInput.characters = 45;

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
      statusText.text = "\u2718 Cannot connect to " + parts.host + ":" + parts.port;
      sendBtn.enabled = false;
    }
  };

  saveBtn.onClick = function () {
    chosenMode = "save";
    dlg.close(2);
  };

  var code = dlg.show();
  if (code === 1) {
    return { mode: "send", url: urlInput.text };
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
  addLog("app.doScript: " + (typeof app.doScript));
  addLog("ScriptLanguage: " + (typeof ScriptLanguage));
  if (typeof ScriptLanguage !== "undefined") {
    try { addLog("ScriptLanguage.APPLESCRIPT: " + ScriptLanguage.APPLESCRIPT); } catch (ignore) {}
  }

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

  // ── Method 5: app.doScript + AppleScript (macOS only) ──
  try {
    if ($.os.indexOf("Macintosh") !== -1 && typeof app.doScript === "function") {
      addLog("\n--- Method 5: app.doScript + AppleScript ---");
      // Build shell command with single-quoted arguments (safe, no escaping needed)
      var sq = "'";
      var shCmd5 = "curl -s -o /dev/null -w " + sq + "%{http_code}" + sq +
                   " --connect-timeout 5 " + sq + url + sq + " 2>/dev/null; true";
      addLog("shell cmd: " + shCmd5);
      var asScript5 = 'do shell script "' + shCmd5 + '"';
      addLog("AppleScript: " + asScript5);

      var asResult5 = null;
      if (typeof ScriptLanguage !== "undefined") {
        try {
          asResult5 = app.doScript(asScript5, ScriptLanguage.APPLESCRIPT);
        } catch (dsErr5) {
          addLog("doScript threw: " + dsErr5.message);
        }
      } else {
        addLog("ScriptLanguage enum not found");
      }

      addLog("result: " + String(asResult5));
      if (asResult5 !== null && asResult5 !== undefined) {
        var trimmed5 = String(asResult5).replace(/\s/g, "");
        addLog("trimmed: [" + trimmed5 + "]");
        if (trimmed5 === "200") {
          addLog("SUCCESS via app.doScript + AppleScript");
          return true;
        }
      }
    } else {
      addLog("\nMethod 5 not available (not macOS or app.doScript missing)");
    }
  } catch (e5) {
    addLog("Method 5 exception: " + e5.message);
  }

  // ── Method 6: File.execute with shell script (macOS only) ──
  try {
    if ($.os.indexOf("Macintosh") !== -1) {
      addLog("\n--- Method 6: File.execute + shell script ---");
      var tmpSh6 = new File(Folder.temp.absoluteURI + "/laserflow-test.command");
      var tmpResult6 = new File(Folder.temp.absoluteURI + "/laserflow-test-result.txt");
      tmpSh6.open("w");
      tmpSh6.writeln("#!/bin/sh");
      tmpSh6.writeln('curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "' + url + '" > "' + tmpResult6.fsName + '" 2>/dev/null');
      tmpSh6.close();

      // Make executable and run
      addLog("script: " + tmpSh6.fsName);
      var execResult = tmpSh6.execute();
      addLog("execute() returned: " + execResult);

      // File.execute() is async — wait briefly, then check result
      $.sleep(6000);
      if (tmpResult6.exists) {
        var out6 = readFile(tmpResult6);
        tmpResult6.remove();
        addLog("result file: " + (out6 ? out6.substring(0, 100) : "(empty)"));
        if (out6 && out6.replace(/\s/g, "") === "200") {
          tmpSh6.remove();
          addLog("SUCCESS via File.execute");
          return true;
        }
      } else {
        addLog("result file not created");
      }
      tmpSh6.remove();
    }
  } catch (e6) {
    addLog("Method 6 exception: " + e6.message);
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

  addLog("\nAll methods failed.");
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
 * Tries (in order): system.callSystem, app.system, app.doScript+AppleScript,
 * File.execute+shell script, then Socket fallback.
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

  // ── Method 5: app.doScript + AppleScript (macOS only) ──
  try {
    if ($.os.indexOf("Macintosh") !== -1 && typeof app.doScript === "function" && typeof ScriptLanguage !== "undefined") {
      // Re-create payload file (may have been cleaned up above)
      tmpPayload.open("w");
      tmpPayload.write(jsonBody);
      tmpPayload.close();

      // Write a shell script that runs the curl POST
      var tmpSh = new File(Folder.temp.absoluteURI + "/laserflow-post.sh");
      tmpSh.open("w");
      tmpSh.writeln("#!/bin/sh");
      tmpSh.writeln('curl -s -w "\\n%{http_code}" --connect-timeout 10 -X POST -H "Content-Type: application/json" -d @"' + tmpPayload.fsName + '" "' + url + '" 2>/dev/null');
      tmpSh.close();

      // Execute via AppleScript do shell script
      var asPost = 'do shell script "/bin/sh \\"' + tmpSh.fsName + '\\""';
      try {
        var rawAs = app.doScript(asPost, ScriptLanguage.APPLESCRIPT);
      } catch (asPostErr) {
        rawAs = null;
      }
      tmpSh.remove();
      if (tmpPayload.exists) tmpPayload.remove();

      if (rawAs !== null && rawAs !== undefined) {
        var resultAs = parseCurlResult(String(rawAs), parts);
        if (resultAs) return resultAs;
        // curl returned 000 — server unreachable
        return {
          ok: false,
          error: "Could not connect to " + parts.host + ":" + parts.port + ".\n\nMake sure Laserflow is running."
        };
      }
    }
  } catch (ignore) {}

  // ── Method 6: File.execute + shell script (macOS only) ──
  try {
    if ($.os.indexOf("Macintosh") !== -1) {
      // Re-create payload file if needed
      if (!tmpPayload.exists) {
        tmpPayload.open("w");
        tmpPayload.write(jsonBody);
        tmpPayload.close();
      }

      var tmpShPost = new File(Folder.temp.absoluteURI + "/laserflow-post.command");
      var tmpResultPost = new File(Folder.temp.absoluteURI + "/laserflow-post-output.txt");
      tmpShPost.open("w");
      tmpShPost.writeln("#!/bin/sh");
      tmpShPost.writeln('curl -s -w "\\n%{http_code}" --connect-timeout 10 -X POST -H "Content-Type: application/json" -d @"' + tmpPayload.fsName + '" "' + url + '" > "' + tmpResultPost.fsName + '" 2>/dev/null');
      tmpShPost.close();

      tmpShPost.execute();
      $.sleep(12000);

      if (tmpResultPost.exists) {
        var outPost = readFile(tmpResultPost);
        tmpResultPost.remove();
        tmpShPost.remove();
        if (tmpPayload.exists) tmpPayload.remove();
        if (outPost) {
          var resultExec = parseCurlResult(outPost, parts);
          if (resultExec) return resultExec;
        }
      }
      if (tmpShPost.exists) tmpShPost.remove();
      if (tmpPayload.exists) tmpPayload.remove();
    }
  } catch (ignore) {}

  // ── Method 4: ExtendScript Socket ──
  try {
    var conn = new Socket();
    conn.timeout = 10;
    if (!conn.open(parts.host + ":" + parts.port)) {
      return {
        ok: false,
        error: "All connection methods failed.\n\n" +
               "Make sure Laserflow is running at " + parts.host + ":" + parts.port + ".\n\n" +
               "Try \"Save SVG File Instead\" and drag the\nfile into the Laserflow browser window."
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
    return { ok: false, error: "Exception: " + e.message };
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
