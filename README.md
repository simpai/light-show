# Tesla Light Show Editor

This is a web-based tool for creating and visualizing Tesla Light Shows.

## Features
- **2D/3D Matrix Preview**: High-performance visualization of light sequences.
- **RGBA Support**: Individual color and opacity control for each light point.
- **xLights Export**: Generate `.xsq` and `.fseq` files for use with Tesla vehicles.
- **Zoom Fit**: Easily fit the visualization to your screen.

## Getting Started

### Local Development
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the development server:
   ```bash
   npm run dev
   ```

### Building for Production
```bash
npm run build
```

## Cloudflare Pages Deployment
This project is configured for direct deployment to Cloudflare Pages.
- **Build command**: `npm install && npm run build`
- **Output directory**: `dist`
