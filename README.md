# LithoStudio 3D — Self-Contained Lithophane & Bambu `.3MF` Builder

A 100% client-side 3D Lithophane & Sculptural Relief generator built with WebGL, HTML5 Canvas, and an embedded `.3MF` / `.STL` / `.OBJ` / `.SVG` CAD packaging engine. Designed to run as a standalone browser app, a **full-screen iPhone Progressive Web App (PWA)**, or hosted on **Google Cloud Run / App Engine / GitHub Pages**.

## ✨ Key Features

- **3D Model Shapes**: Circle/Disc, Flat Plane, Self-Standing Curved Arc, Heart, and Hexagon with Flat, Raised Border, or Beveled Frame options and Hanging Hook loop.
- **Physically Accurate Millimeter Light Transmission**: Real Beer-Lambert law light attenuation based on actual millimeter wall thickness (`0.8–3.2mm` glowing backlit lithophane vs. `7–12mm` 0.0% opaque sculptural relief).
- **Smart Edge-Aware Background Removal**:
  - **1-Click Auto Subject Isolation** (Border-Seeded Geodesic Flood + Lab Color Distance + Sobel Edge Barrier).
  - **Interactive 2D Touch-Up**: Magic Click Remove (`-`), Magic Click Keep (`+`), Erase BG Brush, and Restore Subject Brush.
- **Multi-Line Front & Back Text (Emboss or Engrave)**:
  - Supports multi-line text (`Enter`), line spacing (`0.8×–2.0×`), alignment (`Left`, `Center`, `Right`), straight or concentric curved arc paths, and auto-mirrored readable back-surface engraving.
- **All Bambu Lab Printers & Profiles**:
  - **Printers**: `X1 Carbon (X1C)`, `X1E`, `X1`, `P1S`, `P1P`, `A1`, `A1 mini`, `H2D`, and `H2D Laser & Cutting Combo`.
  - **Nozzles & Build Plates**: `0.2mm`, `0.4mm`, `0.6mm`, `0.8mm` nozzles; `Textured PEI`, `Cool Plate SuperTack`, `Smooth PEI`, `Cool Plate`, `Engineering Plate`, and `H2D Laser/Blade Mat`.
  - **27 Process & Cutting Presets + 15 Filament Presets**: Exports ready-to-slice **Bambu Studio `.3MF`** project archives, standalone `.JSON` process presets, watertight binary `.STL`, `.OBJ`, and 1:1 millimeter `.SVG` contour cut paths.
- **iPhone / iPad Full-Screen Web App (PWA)**:
  - Includes Apple Touch Icon, iOS Safe-Area inset support, 1-finger 3D orbit, 2-finger pinch-to-zoom & pan, and responsive mobile split-screen layout.

---

## 🚀 Deploy to Google Cloud Run (1 Command)

```bash
gcloud run deploy lithostudio-3d \
  --source . \
  --region us-central1 \
  --allow-unauthenticated
```

## 🍎 Install as an iPhone App (iOS Safari)

1. Open your deployed HTTPS URL (or GitHub Pages URL) in **Safari on iPhone**.
2. Tap the **Share** button (`↑`) at the bottom of Safari.
3. Tap **"Add to Home Screen"** → **Add**.
