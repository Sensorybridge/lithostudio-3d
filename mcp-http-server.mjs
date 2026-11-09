#!/usr/bin/env node
/**
 * LithoStudio 3D — Remote Streamable HTTP + SSE MCP Server for ChatGPT Workspace Plugins / Connectors
 * Supports:
 *   - POST /mcp  (MCP 2025-03-26 / 2024-11-05 Streamable HTTP JSON-RPC)
 *   - GET  /sse  & POST /messages (Legacy HTTP+SSE MCP transport)
 *   - GET  /openapi-chatgpt-action.json & /.well-known/ai-plugin.json
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CATALOG = JSON.parse(fs.readFileSync(path.join(__dirname, 'printers-api.json'), 'utf8'));

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

const TOOLS = [
  {
    name: 'list_3d_printers_and_profiles',
    description: 'Lists supported 3D printer brands and models (Bambu Lab, Prusa, Creality, Anycubic, Elegoo, Qidi, FlashForge, Voron, Sovol), their X/Y/Z build volumes in mm, and MakerLab CMYK / Keepsake Puck presets.',
    inputSchema: {
      type: 'object',
      properties: {
        brand_filter: { type: 'string', description: 'Optional brand filter (e.g., "Bambu", "Prusa", "Creality").' }
      }
    }
  },
  {
    name: 'configure_lithostudio_deeplink',
    description: 'Generates a pre-configured LithoStudio 3D URL deep-link clamped to the selected 3D printer build volume (with optional CMYK 4-Color AMS mode, Keepsake Puck profile, or custom engraved/embossed text).',
    inputSchema: {
      type: 'object',
      properties: {
        printer: { type: 'string', description: 'Printer ID (e.g. "x2d", "x1c", "p1s", "a1", "a1mini", "prusa_mk4s", "creality_k2plus").' },
        shape: { type: 'string', enum: ['circle', 'plane', 'arc', 'cylinder', 'sphere', 'dome', 'prism'] },
        diameter: { type: 'number', description: 'Target diameter or width in mm (automatically clamped to printer build volume).' },
        height: { type: 'number', description: 'Target height in mm (automatically clamped to printer build volume).' },
        minThick: { type: 'number', description: 'Minimum highlight thickness in mm (default: 4.75 for Keepsake Puck, 0.8 for standard).' },
        maxThick: { type: 'number', description: 'Maximum shadow thickness in mm (default: 6.0 for Keepsake Puck, 2.8 for standard).' },
        cmyk: { type: 'boolean', description: 'Enable Bambu MakerLab CMYK 4-Color AMS mode.' },
        layFlat: { type: 'boolean', description: 'Lay flat on build plate (true for keepsake pucks & flat plates).' },
        text: { type: 'string', description: 'Optional caption text to engrave or emboss.' },
        textMode: { type: 'string', enum: ['engrave', 'emboss'] }
      }
    }
  }
];

function handleJsonRpc(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'lithostudio-3d-mcp', version: '1.4.0' }
      }
    };
  }
  if (method === 'notifications/initialized') return null;
  if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };
  if (method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
  if (method === 'tools/call') {
    const name = params?.name;
    const args = params?.arguments || {};
    if (name === 'list_3d_printers_and_profiles') {
      const filter = (args.brand_filter || '').toLowerCase().trim();
      const printers = {};
      for (const [k, p] of Object.entries(CATALOG.printers)) {
        if (!filter || p.brand.toLowerCase().includes(filter) || p.name.toLowerCase().includes(filter) || k.includes(filter)) {
          printers[k] = p;
        }
      }
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: JSON.stringify({ default_keepsake_profile: CATALOG.default_keepsake_profile, makerlab_formats: CATALOG.makerlab_formats, printers }, null, 2) }]
        }
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
      const clampedHeight = ['circle', 'sphere', 'dome'].includes(shape) ? clampedDia : Math.max(20, Math.min(limits.maxHeight, rawHeight));
      const minThick = Number(args.minThick ?? (args.cmyk ? 0.6 : 4.75));
      const maxThick = Number(args.maxThick ?? (args.cmyk ? 2.4 : 6.0));
      const q = new URLSearchParams({
        printer,
        shape,
        diameter: String(clampedDia),
        height: String(clampedHeight),
        minThick: String(minThick),
        maxThick: String(maxThick),
        layFlat: layFlat ? '1' : '0'
      });
      if (args.cmyk) q.set('cmyk', '1');
      if (args.text) {
        q.set('text', String(args.text));
        if (args.textMode) q.set('textMode', String(args.textMode));
      }
      const url = `${CATALOG.studio_url}?${q.toString()}`;
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{
            type: 'text',
            text: JSON.stringify({
              deep_link_url: url,
              printer_limits_enforced: limits,
              configured_dimensions_mm: { shape, diameter_or_width: clampedDia, height: clampedHeight, minThick, maxThick, was_clamped: (clampedDia !== rawDia || clampedHeight !== rawHeight) }
            }, null, 2)
          }]
        }
      };
    }
    return { jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown tool: ${name}` } };
  }
  return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
}

const sseClients = new Set();
const PORT = Number(process.env.PORT || 8080);

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // Streamable HTTP MCP endpoint (/mcp) or SSE message endpoint (/messages)
  if (req.method === 'POST' && (urlObj.pathname === '/mcp' || urlObj.pathname === '/messages')) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        const reply = Array.isArray(parsed)
          ? parsed.map(handleJsonRpc).filter(Boolean)
          : handleJsonRpc(parsed);
        if (urlObj.pathname === '/messages') {
          for (const client of sseClients) {
            if (reply) client.write(`event: message\ndata: ${JSON.stringify(reply)}\n\n`);
          }
          res.writeHead(202, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'accepted' }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(reply ? JSON.stringify(reply) : '');
        }
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON-RPC payload' }));
      }
    });
    return;
  }

  // SSE MCP endpoint (/sse)
  if (req.method === 'GET' && urlObj.pathname === '/sse') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write(`event: endpoint\ndata: /messages\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // Static files fallback
  let relPath = urlObj.pathname === '/' ? '/index.html' : urlObj.pathname;
  const safePath = path.join(__dirname, path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, ''));
  if (fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
    const ext = path.extname(safePath).toLowerCase();
    const mime = { '.html': 'text/html', '.json': 'application/json', '.js': 'application/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    fs.createReadStream(safePath).pipe(res);
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`LithoStudio 3D Web + Remote MCP Server listening on http://localhost:${PORT} (MCP: /mcp and /sse)`);
});
