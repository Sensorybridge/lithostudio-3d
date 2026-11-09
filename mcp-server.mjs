#!/usr/bin/env node
/**
 * LithoStudio 3D — Official Model Context Protocol (MCP) Server
 * Works with Claude Desktop, Claude Code, Cursor, and Windsurf (zero external npm dependencies).
 *
 * Usage in claude_desktop_config.json:
 * {
 *   "mcpServers": {
 *     "lithostudio-3d": {
 *       "command": "node",
 *       "args": ["/absolute/path/to/lithostudio-3d/mcp-server.mjs"]
 *     }
 *   }
 * }
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const apiJsonPath = path.join(__dirname, 'printers-api.json');
let CATALOG = { printers: {}, makerlab_formats: {}, studio_url: 'https://sensorybridge.github.io/lithostudio-3d/' };
try {
  CATALOG = JSON.parse(fs.readFileSync(apiJsonPath, 'utf8'));
} catch (err) {
  // Fallback embedded minimal catalog if run outside repo directory
  CATALOG.printers = {
    x2d: { brand: 'Bambu Lab', name: 'Bambu Lab X2D / H2D Dual-Nozzle', bedX: 350, bedY: 320, bedZ: 325 },
    x1c: { brand: 'Bambu Lab', name: 'Bambu Lab X1 Carbon (X1C) / X1E', bedX: 256, bedY: 256, bedZ: 256 },
    p1s: { brand: 'Bambu Lab', name: 'Bambu Lab P1S / P1P', bedX: 256, bedY: 256, bedZ: 256 },
    a1: { brand: 'Bambu Lab', name: 'Bambu Lab A1', bedX: 256, bedY: 256, bedZ: 256 },
    a1mini: { brand: 'Bambu Lab', name: 'Bambu Lab A1 Mini', bedX: 180, bedY: 180, bedZ: 180 }
  };
}

function computePrinterShapeLimits(printerKey, shape = 'circle', layFlat = true) {
  const p = CATALOG.printers[printerKey] || CATALOG.printers.x2d || { bedX: 256, bedY: 256, bedZ: 256, name: printerKey };
  const maxFootprint = Math.min(p.bedX, p.bedY);
  const maxWidthOrDia = shape === 'plane' ? p.bedX : maxFootprint;
  const maxHeight = layFlat ? p.bedY : p.bedZ;
  return {
    printerKey,
    printerName: p.name,
    bedX: p.bedX,
    bedY: p.bedY,
    bedZ: p.bedZ,
    maxDiameterOrWidth: maxWidthOrDia,
    maxHeight
  };
}

function openUrlOrUriOnHost(targetUri) {
  return new Promise((resolve) => {
    const platform = process.platform;
    const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open';
    const args = platform === 'win32' ? ['/c', 'start', '', targetUri] : [targetUri];
    execFile(cmd, args, (err) => {
      resolve(!err);
    });
  });
}

/**
 * Generates a binary STL lithophane keepsake puck or rectangular plate on disk.
 * Uses either a local PGM/RAW grayscale file or a procedural concentric/radial test relief.
 */
function writeLithophaneBinaryStl({
  outputPath,
  shape = 'circle',
  diameter = 80,
  height = 80,
  minThick = 4.75,
  maxThick = 6.0,
  frameThick = 1.0,
  frameDepth = 6.0,
  gridSegments = 120
}) {
  const N = Math.max(32, Math.min(240, Math.round(gridSegments)));
  const radius = diameter / 2;
  const halfW = diameter / 2;
  const halfH = height / 2;

  // Height function z(u, v) in [0..1]x[0..1]
  function sampleFrontZ(u, v) {
    const x = (u - 0.5) * diameter;
    const y = (v - 0.5) * height;
    if (shape === 'circle') {
      const r = Math.hypot(x, y);
      if (r > radius) return 0;
      if (r >= radius - frameThick) return frameDepth;
      // Smooth radial keepsake dome/medallion wave if no external bitmap
      const normR = r / Math.max(1e-5, radius - frameThick);
      const wave = 0.5 + 0.5 * Math.cos(normR * Math.PI * 2.0);
      return minThick + wave * (maxThick - minThick);
    } else {
      const dx = Math.abs(x);
      const dy = Math.abs(y);
      if (dx >= halfW - frameThick || dy >= halfH - frameThick) return frameDepth;
      const wave = 0.5 + 0.5 * Math.sin(u * Math.PI) * Math.sin(v * Math.PI);
      return minThick + wave * (maxThick - minThick);
    }
  }

  const triangles = [];
  function addTri(a, b, c) {
    triangles.push([a, b, c]);
  }

  // Grid vertices for top & bottom surfaces
  for (let iy = 0; iy < N; iy++) {
    const v0 = iy / N;
    const v1 = (iy + 1) / N;
    const y0 = (v0 - 0.5) * height;
    const y1 = (v1 - 0.5) * height;

    for (let ix = 0; ix < N; ix++) {
      const u0 = ix / N;
      const u1 = (ix + 1) / N;
      const x0 = (u0 - 0.5) * diameter;
      const x1 = (u1 - 0.5) * diameter;

      if (shape === 'circle') {
        const cx = 0.5 * (x0 + x1);
        const cy = 0.5 * (y0 + y1);
        if (Math.hypot(cx, cy) > radius) continue;
      }

      const z00 = sampleFrontZ(u0, v0);
      const z10 = sampleFrontZ(u1, v0);
      const z11 = sampleFrontZ(u1, v1);
      const z01 = sampleFrontZ(u0, v1);

      // Front relief (+Z)
      addTri([x0, y0, z00], [x1, y0, z10], [x1, y1, z11]);
      addTri([x0, y0, z00], [x1, y1, z11], [x0, y1, z01]);

      // Flat back bedplate (Z = 0)
      addTri([x0, y0, 0], [x1, y1, 0], [x1, y0, 0]);
      addTri([x0, y0, 0], [x0, y1, 0], [x1, y1, 0]);
    }
  }

  const triCount = triangles.length;
  const buf = Buffer.alloc(84 + triCount * 50);
  buf.write('LithoStudio 3D MCP Generated Lithophane Mesh', 0, 'ascii');
  buf.writeUInt32LE(triCount, 80);

  let offset = 84;
  for (let i = 0; i < triCount; i++) {
    const [p1, p2, p3] = triangles[i];
    const ux = p2[0] - p1[0], uy = p2[1] - p1[1], uz = p2[2] - p1[2];
    const vx = p3[0] - p1[0], vy = p3[1] - p1[1], vz = p3[2] - p1[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;

    buf.writeFloatLE(nx, offset);
    buf.writeFloatLE(ny, offset + 4);
    buf.writeFloatLE(nz, offset + 8);
    buf.writeFloatLE(p1[0], offset + 12);
    buf.writeFloatLE(p1[1], offset + 16);
    buf.writeFloatLE(p1[2], offset + 20);
    buf.writeFloatLE(p2[0], offset + 24);
    buf.writeFloatLE(p2[1], offset + 28);
    buf.writeFloatLE(p2[2], offset + 32);
    buf.writeFloatLE(p3[0], offset + 36);
    buf.writeFloatLE(p3[1], offset + 40);
    buf.writeFloatLE(p3[2], offset + 44);
    buf.writeUInt16LE(0, offset + 48);
    offset += 50;
  }

  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(outputPath, buf);
  return { outputPath: path.resolve(outputPath), triangles: triCount, bytes: buf.length };
}

const TOOLS = [
  {
    name: 'list_3d_printers_and_profiles',
    description: 'Lists supported 3D printer brands and models (Bambu Lab, Prusa, Creality, Anycubic, Elegoo, Qidi, FlashForge, Voron, Sovol), their X/Y/Z build volumes in mm, and MakerLab CMYK / Keepsake Puck presets.',
    inputSchema: {
      type: 'object',
      properties: {
        brand_filter: {
          type: 'string',
          description: 'Optional brand filter (e.g., "Bambu", "Prusa", "Creality", "Anycubic", "Elegoo", "Qidi", "FlashForge", "Voron", "Sovol").'
        }
      }
    }
  },
  {
    name: 'configure_lithostudio_deeplink',
    description: 'Generates a pre-configured LithoStudio 3D URL deep-link clamped to the selected 3D printer build volume (with optional CMYK 4-Color AMS mode, Keepsake Puck profile, or custom engraved/embossed text), and optionally opens it in the user browser so their personal photo stays 100% local.',
    inputSchema: {
      type: 'object',
      properties: {
        printer: { type: 'string', description: 'Printer ID from list_3d_printers_and_profiles (default: "x2d").' },
        shape: { type: 'string', enum: ['circle', 'plane', 'arc', 'cylinder', 'sphere', 'dome', 'prism'], description: 'Lithophane geometry shape (default: "circle").' },
        diameter: { type: 'number', description: 'Target diameter or width in mm (automatically clamped to printer build volume). Default: 80.' },
        height: { type: 'number', description: 'Target height in mm (automatically clamped to printer build volume). Default: 80.' },
        minThick: { type: 'number', description: 'Minimum highlight thickness in mm (default: 4.75 for Keepsake Puck, 0.8 for standard lithophane).' },
        maxThick: { type: 'number', description: 'Maximum shadow thickness in mm (default: 6.0 for Keepsake Puck, 2.8 for standard lithophane).' },
        cmyk: { type: 'boolean', description: 'Enable Bambu MakerLab CMYK 4-Color AMS mode (Jade White, Cyan, Magenta, Yellow).' },
        layFlat: { type: 'boolean', description: 'Lay flat on build plate (true for keepsake pucks & flat plates; false for tall standing prints).' },
        text: { type: 'string', description: 'Optional custom caption text to engrave or emboss onto the lithophane.' },
        textMode: { type: 'string', enum: ['engrave', 'emboss'], description: 'Engrave (bright glowing text) or Emboss (dark raised text).' },
        open_in_browser: { type: 'boolean', description: 'If true, automatically opens the configured studio link in the user default web browser.' }
      }
    }
  },
  {
    name: 'generate_lithophane_stl',
    description: 'Generates a printable binary .STL lithophane keepsake puck or plate on the local filesystem, enforcing the selected 3D printer build volume limits.',
    inputSchema: {
      type: 'object',
      required: ['output_path'],
      properties: {
        output_path: { type: 'string', description: 'Local file path for the generated .stl file (e.g. "./keepsake_puck_80mm.stl").' },
        printer: { type: 'string', description: 'Printer ID to enforce maximum build volume limits (default: "x2d").' },
        shape: { type: 'string', enum: ['circle', 'plane'], description: 'Shape ("circle" for keepsake puck, "plane" for rectangular plate).' },
        diameter: { type: 'number', description: 'Diameter or width in mm (default: 80).' },
        height: { type: 'number', description: 'Height in mm (default: 80).' },
        minThick: { type: 'number', description: 'Minimum highlight thickness in mm (default: 4.75).' },
        maxThick: { type: 'number', description: 'Maximum shadow thickness in mm (default: 6.0).' }
      }
    }
  },
  {
    name: 'launch_bambu_slicer',
    description: 'Launches Bambu Connect (bambu-connect://import-file) or Bambu Studio (bambustudioopen://) on the user desktop to slice and send a .3MF or .STL file to a Bambu Lab printer.',
    inputSchema: {
      type: 'object',
      required: ['file_path'],
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the local .3mf or .stl file.' },
        launcher: { type: 'string', enum: ['bambu-connect', 'bambu-studio'], description: 'Choose "bambu-connect" or "bambu-studio" (default: "bambu-connect").' }
      }
    }
  }
];

async function handleToolCall(name, args = {}) {
  if (name === 'list_3d_printers_and_profiles') {
    const filter = (args.brand_filter || '').toLowerCase().trim();
    const printers = {};
    for (const [id, p] of Object.entries(CATALOG.printers)) {
      if (!filter || p.brand.toLowerCase().includes(filter) || p.name.toLowerCase().includes(filter) || id.includes(filter)) {
        printers[id] = p;
      }
    }
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            default_keepsake_profile: CATALOG.default_keepsake_profile,
            makerlab_formats: CATALOG.makerlab_formats,
            printers
          }, null, 2)
        }
      ]
    };
  }

  if (name === 'configure_lithostudio_deeplink') {
    const printer = args.printer && CATALOG.printers[args.printer] ? args.printer : 'x2d';
    const shape = args.shape || 'circle';
    const layFlat = args.layFlat !== undefined ? Boolean(args.layFlat) : true;
    const limits = computePrinterShapeLimits(printer, shape, layFlat);

    const rawDia = Number(args.diameter ?? 80);
    const rawHeight = Number(args.height ?? rawDia);
    const clampedDia = Math.max(20, Math.min(limits.maxDiameterOrWidth, rawDia));
    const clampedHeight = shape === 'circle' || shape === 'sphere' || shape === 'dome'
      ? clampedDia
      : Math.max(20, Math.min(limits.maxHeight, rawHeight));

    const minThick = Number(args.minThick ?? (args.cmyk ? 0.6 : 4.75));
    const maxThick = Number(args.maxThick ?? (args.cmyk ? 2.4 : 6.0));

    const params = new URLSearchParams();
    params.set('printer', printer);
    params.set('shape', shape);
    params.set('diameter', String(clampedDia));
    params.set('height', String(clampedHeight));
    params.set('minThick', String(minThick));
    params.set('maxThick', String(maxThick));
    params.set('layFlat', layFlat ? '1' : '0');
    if (args.cmyk) params.set('cmyk', '1');
    if (args.text) {
      params.set('text', String(args.text));
      if (args.textMode) params.set('textMode', String(args.textMode));
    }

    const url = `${CATALOG.studio_url}?${params.toString()}`;
    let opened = false;
    if (args.open_in_browser) {
      opened = await openUrlOrUriOnHost(url);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            deep_link_url: url,
            opened_in_browser: opened,
            printer_limits_enforced: limits,
            configured_dimensions_mm: {
              shape,
              diameter_or_width: clampedDia,
              height: clampedHeight,
              minThick,
              maxThick,
              was_clamped: (clampedDia !== rawDia || clampedHeight !== rawHeight)
            },
            privacy_note: 'Open this link in your browser and drop your personal photo into the studio. Your photo is processed 100% locally in WebGL.'
          }, null, 2)
        }
      ]
    };
  }

  if (name === 'generate_lithophane_stl') {
    const printer = args.printer && CATALOG.printers[args.printer] ? args.printer : 'x2d';
    const shape = args.shape === 'plane' ? 'plane' : 'circle';
    const limits = computePrinterShapeLimits(printer, shape, true);
    const clampedDia = Math.max(20, Math.min(limits.maxDiameterOrWidth, Number(args.diameter ?? 80)));
    const clampedHeight = shape === 'circle' ? clampedDia : Math.max(20, Math.min(limits.maxHeight, Number(args.height ?? 80)));
    const minThick = Number(args.minThick ?? 4.75);
    const maxThick = Number(args.maxThick ?? 6.0);

    const res = writeLithophaneBinaryStl({
      outputPath: args.output_path,
      shape,
      diameter: clampedDia,
      height: clampedHeight,
      minThick,
      maxThick,
      frameThick: 1.0,
      frameDepth: maxThick
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'ok',
            file: res.outputPath,
            triangles: res.triangles,
            bytes: res.bytes,
            printer_enforced: limits.printerName,
            dimensions_mm: { shape, diameter: clampedDia, height: clampedHeight, minThick, maxThick }
          }, null, 2)
        }
      ]
    };
  }

  if (name === 'launch_bambu_slicer') {
    const absPath = path.resolve(String(args.file_path));
    const launcher = args.launcher === 'bambu-studio' ? 'bambu-studio' : 'bambu-connect';
    const uri = launcher === 'bambu-connect'
      ? `bambu-connect://import-file?path=${encodeURIComponent(absPath)}&name=${encodeURIComponent(path.basename(absPath))}&version=1.0`
      : `bambustudioopen://${encodeURIComponent(absPath)}`;
    const launched = await openUrlOrUriOnHost(uri);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'ok',
            launcher,
            uri,
            dispatched_to_os: launched
          }, null, 2)
        }
      ]
    };
  }

  throw new Error(`Unknown tool: ${name}`);
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });

function sendResponse(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

function sendError(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
}

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch (e) {
    return;
  }

  const { id, method, params } = msg;
  if (method === 'initialize') {
    sendResponse(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: {
        name: 'lithostudio-3d-mcp',
        version: '1.4.0'
      }
    });
  } else if (method === 'notifications/initialized') {
    // No response required for notifications
  } else if (method === 'ping') {
    sendResponse(id, {});
  } else if (method === 'tools/list') {
    sendResponse(id, { tools: TOOLS });
  } else if (method === 'tools/call') {
    try {
      const result = await handleToolCall(params?.name, params?.arguments || {});
      sendResponse(id, result);
    } catch (err) {
      sendError(id, -32000, err.message || 'Tool execution error');
    }
  } else if (id !== undefined) {
    sendError(id, -32601, `Method not found: ${method}`);
  }
});
