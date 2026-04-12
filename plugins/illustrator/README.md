# Adobe Illustrator → Laserflow Plugin

Send SVG designs directly from Adobe Illustrator to your running Laserflow instance.

## How it works

The plugin exports your Illustrator document (or selected objects) as SVG and writes a JSON file to a shared **import inbox** directory.  The Laserflow backend watches that directory and automatically imports new files, pushing them to the editor via WebSocket.

This file-based approach works reliably even in sandboxed Illustrator environments where ExtendScript networking (`Socket`, `system.callSystem`) is unavailable.

## Installation

1. Copy `Send to Laserflow.jsx` into your Illustrator **Scripts** folder:

   | Platform | Path |
   |----------|------|
   | **Windows** | `C:\Program Files\Adobe\Adobe Illustrator <version>\Presets\en_US\Scripts\` |
   | **macOS** | `/Applications/Adobe Illustrator <version>/Presets/en_US/Scripts/` |

2. Restart Adobe Illustrator.

The script now appears under **File → Scripts → Send to Laserflow**.

## Usage

1. Open or create a document in Illustrator.
2. Make sure Laserflow is running.
3. Open a project in the Laserflow editor so there is an active project to receive the import.
4. In Illustrator, go to **File → Scripts → Send to Laserflow**.
5. A dialog will appear showing the import inbox directory.  Optionally check **"Send selected objects only"** to export just the current selection.
6. Click **Send**.  The design will be parsed and imported as a new layer in your active Laserflow project.

## Configuration

### Import inbox directory

By default the inbox is `~/.laserflow/import/`.  You can change it in two places (both must match):

- **Laserflow frontend**: Settings → Import Inbox → Inbox Directory
- **Illustrator plugin**: The dialog shows an editable path with a Browse button.  To change the default permanently, edit the `DEFAULT_INBOX` variable at the top of the script:

```javascript
var DEFAULT_INBOX = Folder("~").fsName + "/.laserflow/import";
```

### Exporting selected objects

If objects are selected in Illustrator when you run the script, the **"Send selected objects only"** checkbox is automatically enabled.  The plugin temporarily hides unselected items, shrinks the artboard to the selection bounds, exports, and then restores everything.

## Troubleshooting

- **Nothing appears in the editor** — Make sure a project is open in the Laserflow editor. The pushed SVG is imported into the currently active project.
- **"Laserflow did not pick it up"** — The backend may not be running, or the inbox directory paths don't match between the plugin and backend.  Check Laserflow Settings → Import Inbox.
- **Scaling is wrong** — The plugin injects explicit `mm` dimensions into the SVG.  If you see incorrect sizes, make sure the document units in Illustrator are set to millimetres.
- **Fonts not converting** — The script exports with `fontSubsetting: None`. For best results, convert text to outlines in Illustrator before sending (**Type → Create Outlines**).
