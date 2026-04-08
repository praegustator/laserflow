# Adobe Illustrator → Laserflow Plugin

Send SVG designs directly from Adobe Illustrator to your running Laserflow instance.

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
2. Make sure Laserflow is running (default: `http://localhost:3001`).
3. Open a project in the Laserflow editor so there is an active project to receive the import.
4. In Illustrator, go to **File → Scripts → Send to Laserflow**.
5. The design will be parsed and imported as a new layer in your active Laserflow project.

## Configuration

By default the script sends to `http://localhost:3001`. If your Laserflow backend runs on a different host or port, edit the `LASERFLOW_URL` variable at the top of the script:

```javascript
var LASERFLOW_URL = "http://192.168.1.100:3001/api/import/svg";
```

## API Endpoint

The script uses the `POST /api/import/svg` endpoint. This endpoint can also be called from other tools:

### JSON body

```bash
curl -X POST http://localhost:3001/api/import/svg \
  -H "Content-Type: application/json" \
  -d '{"svg": "<svg>...</svg>", "filename": "my-design"}'
```

### Multipart file upload

```bash
curl -X POST http://localhost:3001/api/import/svg \
  -F "file=@my-design.svg"
```

Both methods parse the SVG and push the result to all connected Laserflow frontends via WebSocket.

## Troubleshooting

- **"Could not reach Laserflow"** — Make sure the Laserflow backend is running and the URL is correct.
- **Nothing appears in the editor** — Make sure a project is open in the Laserflow editor. The pushed SVG is imported into the currently active project.
- **Fonts not converting** — The script exports with `fontSubsetting: None`. For best results, convert text to outlines in Illustrator before sending (**Type → Create Outlines**).
