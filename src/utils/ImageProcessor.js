import { parseGIF, decompressFrames } from 'gifuct-js';

export class ImageProcessor {
    /**
     * Load and parse GIF file
     * @param {File} file - GIF file
     * @returns {Promise<{frames: ImageData[], fps: number, width: number, height: number}>}
     */
    static async parseGIF(file) {
        const arrayBuffer = await file.arrayBuffer();
        const gif = parseGIF(arrayBuffer);
        const frames = decompressFrames(gif, true);

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        canvas.width = frames[0].dims.width;
        canvas.height = frames[0].dims.height;

        const imageDataFrames = [];

        // Process each frame, compositing them properly
        for (let i = 0; i < frames.length; i++) {
            const frame = frames[i];

            // Create a temporary canvas for this frame's patch
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            tempCanvas.width = frame.dims.width;
            tempCanvas.height = frame.dims.height;

            // Create ImageData from the patch
            const patchImageData = tempCtx.createImageData(frame.dims.width, frame.dims.height);
            patchImageData.data.set(frame.patch);
            tempCtx.putImageData(patchImageData, 0, 0);

            // Draw the patch onto the main canvas at the correct position
            ctx.drawImage(
                tempCanvas,
                frame.dims.left,
                frame.dims.top,
                frame.dims.width,
                frame.dims.height
            );

            // Capture the current state of the canvas
            const fullFrameData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            imageDataFrames.push(fullFrameData);

            // Handle disposal method for next frame
            // disposalType: 0=none, 1=keep, 2=restore to background, 3=restore to previous
            if (frame.disposalType === 2) {
                // Clear to transparent
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
            // For disposalType 0 or 1, keep the current frame for the next one
        }

        // Calculate FPS from delay (delay is in centiseconds)
        const avgDelay = frames.reduce((sum, f) => sum + f.delay, 0) / frames.length;
        const fps = avgDelay > 0 ? Math.round(100 / avgDelay) : 12;

        return {
            frames: imageDataFrames,
            fps: Math.min(fps, 30), // Cap at 30 FPS
            width: canvas.width,
            height: canvas.height
        };
    }

    /**
     * Load static image (PNG/JPG)
     * @param {File} file - Image file
     * @returns {Promise<{frames: ImageData[], fps: number, width: number, height: number}>}
     */
    static async loadImage(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);

            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);

                const imageData = ctx.getImageData(0, 0, img.width, img.height);
                URL.revokeObjectURL(url);

                resolve({
                    frames: [imageData],
                    fps: 1, // Static image
                    width: img.width,
                    height: img.height
                });
            };

            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Failed to load image'));
            };

            img.src = url;
        });
    }

    /**
     * Convert pixel RGBA to brightness value (0-255)
     * Using luminance formula
     */
    static pixelToBrightness(r, g, b, a) {
        // Luminance: 0.299*R + 0.587*G + 0.114*B
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        return Math.floor(luminance * (a / 255));
    }

    /**
     * Apply brightness mode
     * @param {number} brightness - Raw brightness (0-255)
     * @param {string} mode - 'binary' or 'gradient'
     * @param {number} threshold - Threshold for binary mode (default 128)
     */
    static applyBrightnessMode(brightness, mode = 'gradient', threshold = 128) {
        if (mode === 'binary') {
            return brightness > threshold ? 255 : 0;
        }
        return brightness; // gradient mode
    }
}
