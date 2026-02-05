/**
 * Layout Parser - Parses PNG images to extract car layout data
 * 
 * RGBA Channel Mapping:
 * - A (Alpha): Car existence (0=no car, >0=car exists)
 * - R (Red): X offset in COL direction (127=0, 0=-max, 255=+max)
 * - G (Green): Y offset in ROW direction (127=0, 0=-max, 255=+max)
 * - B (Blue): Yaw rotation (0-255 → 0-360°)
 */

export class LayoutParser {
    /**
     * Parse a PNG image file and extract layout data
     * @param {File} file - PNG image file
     * @param {number} colSpacing - Spacing between columns (used as max offset)
     * @param {number} rowSpacing - Spacing between rows (used as max offset)
     * @returns {Promise<Object>} Layout data with width, height, and car configurations
     */
    static async parseLayoutImage(file, colSpacing = 2.5, rowSpacing = 6) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const reader = new FileReader();

            reader.onload = (e) => {
                img.onload = () => {
                    try {
                        // Create canvas to read pixel data
                        const canvas = document.createElement('canvas');
                        canvas.width = img.width;
                        canvas.height = img.height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);

                        // Get RGBA pixel data
                        const imageData = ctx.getImageData(0, 0, img.width, img.height);
                        const pixels = imageData.data;

                        // Parse layout data
                        const layout = [];
                        for (let row = 0; row < img.height; row++) {
                            layout[row] = [];
                            for (let col = 0; col < img.width; col++) {
                                const idx = (row * img.width + col) * 4;
                                const r = pixels[idx];
                                const g = pixels[idx + 1];
                                const b = pixels[idx + 2];
                                const a = pixels[idx + 3];

                                // Parse each channel
                                const exists = a > 0;
                                const offsetX = ((r - 127) / 127) * colSpacing;
                                const offsetY = ((g - 127) / 127) * rowSpacing;
                                const rotationDegrees = (b / 255) * 360;

                                layout[row][col] = {
                                    exists,
                                    offsetX,
                                    offsetY,
                                    rotation: rotationDegrees,
                                    // Store raw values for debugging
                                    raw: { r, g, b, a }
                                };
                            }
                        }

                        resolve({
                            width: img.width,
                            height: img.height,
                            layout,
                            imageUrl: e.target.result // Store for display
                        });
                    } catch (err) {
                        reject(err);
                    }
                };

                img.onerror = () => reject(new Error('Failed to load image'));
                img.src = e.target.result;
            };

            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    }

    /**
     * Create a default layout (simple grid with no offsets/rotations)
     * @param {number} cols - Number of columns
     * @param {number} rows - Number of rows
     * @returns {Object} Default layout data
     */
    static createDefaultLayout(cols, rows) {
        const layout = [];
        for (let row = 0; row < rows; row++) {
            layout[row] = [];
            for (let col = 0; col < cols; col++) {
                layout[row][col] = {
                    exists: true,
                    offsetX: 0,
                    offsetY: 0,
                    rotation: 0,
                    raw: { r: 127, g: 127, b: 0, a: 255 }
                };
            }
        }

        return {
            width: cols,
            height: rows,
            layout,
            imageUrl: null
        };
    }
}
