export const CHANNELS = {
    "Left High Beam": 0,
    "Right High Beam": 1,
    "Left Low Beam": 2,
    "Right Low Beam": 3,
    "Left Signature": 4,
    "Right Signature": 5,
    "Left Turn Front": 12,
    "Right Turn Front": 13,
    "Left Fog Front": 14,
    "Right Fog Front": 15,
    "Left Tail": 25,
    "Right Tail": 26,
    "Brake": 24,
    "Left Turn Rear": 10,
    "Right Turn Rear": 11,
    "Left Repeater": 8,
    "Right Repeater": 9,
    "Left Reverse": 22,
    "Right Reverse": 23,
    "Inner Main Beam L": 16,
    "Inner Main Beam R": 17,
    "Outer Main Beam L": 18,
    "Outer Main Beam R": 19,
    "Tail Light Inner L": 20,
    "Tail Light Inner R": 21,
    // Add more indices to fill up to the limit
};

const CHANNEL_COUNT = 48;

// Fill remaining channels if not explicitly named
for (let i = 0; i < CHANNEL_COUNT; i++) {
    const name = Object.keys(CHANNELS).find(key => CHANNELS[key] === i);
    if (!name) {
        CHANNELS[`Channel ${i}`] = i;
    }
}

import { applyEasing } from '../utils/Easing.js';

export class ShowRenderer {
    constructor() {
        this.project = null;
        this.matrixMode = false;
        this.matrixConfig = { rows: 10, cols: 10 };
        this.jitterSeed = Math.random();
        this.matrixBuffer = []; // Cache for matrix frames
        this.initMatrixBuffer();
    }

    clearCache() {
        this.matrixBuffer = [];
        this.initMatrixBuffer();
    }

    setJitterSeed(seed) {
        this.jitterSeed = seed;
    }

    setProject(project) {
        this.project = project;
    }

    setLayoutData(layoutData) {
        this.layoutData = layoutData;
    }

    setMatrixMode(enabled, config = { rows: 10, cols: 10 }) {
        this.matrixMode = enabled;
        this.matrixConfig = config;
        this.initMatrixBuffer();
    }

    initMatrixBuffer() {
        const { rows, cols } = this.matrixConfig;
        // Only reallocate if dimensions changed
        if (this.matrixBuffer.length !== rows || (this.matrixBuffer[0] && this.matrixBuffer[0].length !== cols)) {
            this.matrixBuffer = [];
            for (let r = 0; r < rows; r++) {
                this.matrixBuffer[r] = [];
                for (let c = 0; c < cols; c++) {
                    this.matrixBuffer[r][c] = new Uint8Array(CHANNEL_COUNT).fill(0);
                }
            }
        }
    }

    /**
     * Get pixel from image using 1:1 mapping, centered on the grid, with optional tiling.
     * Each grid cell maps to exactly one image pixel (no stretch/resize).
     * Image is centered on the grid; out-of-bounds pixels wrap (tile) by default or return transparent if disabled.
     */
    getImagePixel1to1(imageData, gridRow, gridCol, gridSize, offsetX = 0, offsetY = 0, disableTiling = false, flipH = false, flipV = false) {
        const imgW = imageData.width;
        const imgH = imageData.height;
        const gridRows = gridSize.rows;
        const gridCols = gridSize.cols;

        // Center the image on the grid
        const centerOffsetCol = Math.floor((gridCols - imgW) / 2);
        const centerOffsetRow = Math.floor((gridRows - imgH) / 2);

        // Map grid position to image pixel (1:1) with offset
        let imgCol = gridCol - centerOffsetCol - Math.round(offsetX);
        let imgRow = gridRow - centerOffsetRow - Math.round(offsetY);

        if (disableTiling) {
            // Clamp to nearest edge pixel
            imgCol = Math.max(0, Math.min(imgW - 1, imgCol));
            imgRow = Math.max(0, Math.min(imgH - 1, imgRow));
        } else {
            // Tiling: wrap around using modulo
            imgCol = ((imgCol % imgW) + imgW) % imgW;
            imgRow = ((imgRow % imgH) + imgH) % imgH;
        }

        // Apply flip
        if (flipH) imgCol = imgW - 1 - imgCol;
        if (flipV) imgRow = imgH - 1 - imgRow;

        const pixIdx = (imgRow * imgW + imgCol) * 4;
        return [
            imageData.data[pixIdx],
            imageData.data[pixIdx + 1],
            imageData.data[pixIdx + 2],
            imageData.data[pixIdx + 3]
        ];
    }

    /**
     * Calculate current animated offset for a clip at a given clip-local time.
     * Interpolates from start offset to end offset over the clip duration with easing.
     * Backward compatible: falls back to legacy offsetX/offsetY if start/end not set.
     */
    getAnimatedOffset(clip, clipTime) {
        const startX = clip.startOffsetX ?? clip.offsetX ?? 0;
        const startY = clip.startOffsetY ?? clip.offsetY ?? 0;
        const endX = clip.endOffsetX ?? startX;
        const endY = clip.endOffsetY ?? startY;

        if (startX === endX && startY === endY) {
            return { x: startX, y: startY };
        }

        const progress = clip.duration > 0 ? Math.max(0, Math.min(1, clipTime / clip.duration)) : 0;
        const easedProgress = applyEasing(progress, clip.offsetEasing || 'linear');

        return {
            x: startX + (endX - startX) * easedProgress,
            y: startY + (endY - startY) * easedProgress
        };
    }

    /**
     * Calculates the frame data for a given timestamp
     * @param {number} timeMs Current playback time in milliseconds
     * @returns {Uint8Array} Array of channel values (0-255)
     */
    getFrame(timeMs) {
        if (!this.project) return new Uint8Array(CHANNEL_COUNT).fill(0);

        // Initialize frame with zeros
        const frameData = new Uint8Array(CHANNEL_COUNT).fill(0);

        // Iterate over layers (bottom to top)
        for (const layer of this.project.layers) {
            if (layer.muted) continue;

            // Render layer directly into frameData (simplified for now, blending is Max)
            // TODO: Optimize renderLayer to write to outFrame to avoid this allocation too
            const layerFrame = this.renderLayer(layer, timeMs);

            // Mix layer into main frame (Simple Max blending for now)
            for (let i = 0; i < CHANNEL_COUNT; i++) {
                frameData[i] = Math.max(frameData[i], layerFrame[i]);
            }
        }

        return frameData;
    }

    /**
     * Get matrix frame data for all cars in the grid
     * @param {number} timeMs Current playback time in milliseconds
     * @param {Object} config Optional config override {rows, cols}
     * @returns {Array<Array<Uint8Array>>} 2D array of frame data [row][col]
     */
    getMatrixFrame(timeMs, config = null) {
        // If config is provided and different, we might need a temp buffer or just re-init
        // For performance, we assume standard usage uses the set matrixConfig
        let rows, cols;
        let useCachedBuffer = false;

        if (config) {
            rows = config.rows;
            cols = config.cols;
            // potential optimization: check if config matches this.matrixConfig
            if (rows === this.matrixConfig.rows && cols === this.matrixConfig.cols) {
                useCachedBuffer = true;
            }
        } else {
            rows = this.matrixConfig.rows;
            cols = this.matrixConfig.cols;
            useCachedBuffer = true;
        }

        // If we can't use cache (rare custom config), fall back to old alloc method
        if (!useCachedBuffer) {
            const grid = [];
            if (!this.project) {
                for (let r = 0; r < rows; r++) {
                    grid[r] = [];
                    for (let c = 0; c < cols; c++) {
                        grid[r][c] = new Uint8Array(CHANNEL_COUNT).fill(0);
                    }
                }
                return grid;
            }
            // ... (rest of fallback logic omitted for brevity, but could just call new implementation with new grid)
            // Re-implementing simplified fallback for custom config to avoid complexity:
            for (let r = 0; r < rows; r++) {
                grid[r] = [];
                for (let c = 0; c < cols; c++) {
                    grid[r][c] = this.getFrameForPosition(timeMs, r, c, { rows, cols });
                }
            }
            return grid;
        }


        // Use Cached Buffer
        const grid = this.matrixBuffer;

        // 1. Clear Buffer
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                grid[r][c].fill(0);
            }
        }

        if (!this.project) return grid;

        // Check if any clip uses position-based patterns or is a gif type
        let hasPositionPattern = false;
        for (const layer of this.project.layers) {
            if (layer.muted) continue;

            let activeClips = [];
            if (layer.isMidi && layer.midiData) {
                const regionClip = layer.clips.find(c => c.type === 'midi-region' && timeMs >= c.startTime && timeMs < (c.startTime + c.duration));
                if (regionClip) {
                    const localTimeMs = timeMs - regionClip.startTime + (regionClip.startOffset || 0);
                    for (const note of layer.midiData) {
                        if (localTimeMs >= note.time && localTimeMs < (note.time + note.duration)) {
                            const mappedFxData = layer.midiMappings?.[note.midi];
                            if (mappedFxData) {
                                let mappedFx = mappedFxData;
                                if (Array.isArray(mappedFxData) && mappedFxData.length > 0) {
                                    const hash = Math.abs(Math.sin(note.time * 12.9898 + note.midi * 78.233)) * 10000;
                                    const selectedIdx = Math.floor(hash) % mappedFxData.length;
                                    mappedFx = mappedFxData[selectedIdx];
                                }

                                // Clamp the visual start time of the FX to the region's start time if the note began before the region was cropped in.
                                // This prevents animations from starting with deep negative timestamps which causes clumping bugs.
                                const rawStartTime = regionClip.startTime + note.time - (regionClip.startOffset || 0);
                                const clampedStartTime = Math.max(regionClip.startTime, rawStartTime);

                                activeClips.push({
                                    ...mappedFx,
                                    startTime: clampedStartTime,
                                    duration: note.duration - (clampedStartTime - rawStartTime), // Reduce duration if we clamped
                                    id: `midi-${note.midi}-${note.time}`
                                });
                            }
                        }
                    }
                }
            } else {
                activeClips = layer.clips.filter(clip => timeMs >= clip.startTime && timeMs < (clip.startTime + clip.duration));
            }

            for (const clip of activeClips) {
                if ((clip.pattern && clip.pattern !== 'uniform') || clip.type === 'gif' || clip.type === 'eq' || clip.carGroupId) {
                    hasPositionPattern = true;
                    break;
                }
            }
            if (hasPositionPattern) break;
        }

        if (!hasPositionPattern) {
            // Use optimized uniform rendering
            // We calculate ONE frame, then copy it to all cells
            // Still faster than calculating per cell, but we need to copy to buffer
            const baseFrame = this.getFrame(timeMs);
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    grid[r][c].set(baseFrame);
                }
            }
        } else {
            // Position-based rendering
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    // Pass the buffer cell to be written to
                    this.getFrameForPosition(timeMs, r, c, { rows, cols }, grid[r][c]);
                }
            }
        }

        return grid;
    }

    /**
     * Get frame data for a specific position in the grid
     * @param {Uint8Array} outFrame Optional buffer to write to. If null, a new one is allocated.
     */
    getFrameForPosition(timeMs, row, col, gridSize, outFrame = null) {
        if (!this.project) return outFrame || new Uint8Array(CHANNEL_COUNT).fill(0);

        const frameData = outFrame || new Uint8Array(CHANNEL_COUNT).fill(0);
        // If outFrame was passed, it should already be clear (or we expect caller to handle it)
        // logic in getMatrixFrame clears it first.
        // If called individually without clear, we might want frameData.fill(0) here, usually safe.

        for (const layer of this.project.layers) {
            if (layer.muted) continue;

            // Find active clips at this time
            let activeClips = [];
            if (layer.isMidi && layer.midiData) {
                const regionClip = layer.clips.find(c => c.type === 'midi-region' && timeMs >= c.startTime && timeMs < (c.startTime + c.duration));
                if (regionClip) {
                    const localTimeMs = timeMs - regionClip.startTime + (regionClip.startOffset || 0);
                    for (const note of layer.midiData) {
                        if (localTimeMs >= note.time && localTimeMs < (note.time + note.duration)) {
                            const mappedFxData = layer.midiMappings?.[note.midi];
                            if (mappedFxData) {
                                let mappedFx = mappedFxData;
                                if (Array.isArray(mappedFxData) && mappedFxData.length > 0) {
                                    const hash = Math.abs(Math.sin(note.time * 12.9898 + note.midi * 78.233)) * 10000;
                                    const selectedIdx = Math.floor(hash) % mappedFxData.length;
                                    mappedFx = mappedFxData[selectedIdx];
                                }

                                const rawStartTime = regionClip.startTime + note.time - (regionClip.startOffset || 0);
                                const clampedStartTime = Math.max(regionClip.startTime, rawStartTime);

                                activeClips.push({
                                    ...mappedFx,
                                    startTime: clampedStartTime,
                                    duration: note.duration - (clampedStartTime - rawStartTime),
                                    id: `midi-${note.midi}-${note.time}`
                                });
                            }
                        }
                    }
                }
            } else {
                activeClips = layer.clips.filter(c =>
                    timeMs >= c.startTime &&
                    timeMs < (c.startTime + c.duration)
                );
            }

            for (const clip of activeClips) {
                // Filter by Car Group if applicable
                if (clip.carGroupId && clip.type !== 'eq') {
                    const group = this.project.carGroups?.find(g => g.id === clip.carGroupId);
                    if (group) {
                        const key = `${row},${col}`;
                        const isSelected = group.selection.includes(key);
                        if (!isSelected) continue; // Skip rendering for this car
                    }
                }

                // Apply Jitter if enabled
                let jitterOffset = 0;
                if (this.project.jitter > 0) {
                    // Stable per-car random offset using position and seed
                    // A simple hash-like function for predictable randomness
                    const carIndex = (row * gridSize.cols) + col;
                    const val = Math.sin(carIndex * 12.9898 + this.jitterSeed * 78.233) * 43758.5453;
                    const normalized = val - Math.floor(val); // 0 to 1
                    jitterOffset = (normalized * 2 - 1) * this.project.jitter; // -jitter to +jitter
                }

                // Calculate position-based time offset
                let timeOffset = 0;
                if (clip.pattern && clip.pattern !== 'uniform') {
                    const invert = !!clip.patternInvert;
                    switch (clip.pattern) {
                        // --- Legacy patterns: speed-based, no invert ---
                        case 'wave':
                            timeOffset = this.calculateWaveOffset(row, col, clip.patternDirection, clip.patternSpeed || 1, gridSize, false);
                            break;
                        case 'sequential':
                            timeOffset = this.calculateSequentialOffset(row, col, clip.patternDirection, clip.patternSpeed || 1, gridSize, false);
                            break;
                        case 'radial':
                            timeOffset = this.calculateRadialOffset(row, col, clip.patternDirection, clip.patternSpeed || 1, gridSize, false, false);
                            break;
                        // --- New patterns: duration-based, no invert (direction stays same) ---
                        case 'directional':
                            timeOffset = this.calculateDurationWaveOffset(row, col, clip.patternDirection, clip.duration, gridSize, false);
                            break;
                        case 'new-radial':
                            timeOffset = this.calculateDurationRadialOffset(row, col, clip.patternDirection, clip.duration, gridSize, false);
                            break;
                        case 'curtain':
                            timeOffset = this.calculateDurationCurtainOffset(row, col, clip.patternDirection, clip.duration, gridSize);
                            break;
                        case 'diamond':
                            timeOffset = this.calculateDurationDiamondOffset(row, col, clip.patternDirection, clip.duration, gridSize);
                            break;
                        case 'zig-zag':
                            timeOffset = this.calculateDurationZigZagOffset(row, col, clip.patternDirection, clip.duration, gridSize);
                            break;
                        case 'box-spiral':
                            timeOffset = this.calculateDurationBoxSpiralOffset(row, col, clip.patternDirection, clip.duration, gridSize);
                            break;
                        case 'interlace':
                            timeOffset = this.calculateDurationInterlaceOffset(row, col, clip.patternDirection, clip.duration, gridSize);
                            break;
                        case 'raindrops':
                            timeOffset = this.calculateDurationRaindropsOffset(row, col, clip.id, clip.duration);
                            break;
                        case 'dissolve':
                            timeOffset = this.calculateDurationDissolveOffset(row, col, clip.id, clip.duration, timeMs, false);
                            break;
                        case 'noise':
                            timeOffset = this.calculateDurationNoiseOffset(
                                row, col, clip.id, clip.duration, timeMs,
                                clip.patternDensity ?? 0.5,
                                clip.patternInterval ?? 100
                            );
                            break;
                    }
                }

                const adjustedTime = timeMs + timeOffset + jitterOffset;
                const clipTime = adjustedTime - clip.startTime;
                const isInRange = clipTime >= 0 && clipTime < clip.duration;

                if (isInRange || (clip.type === 'effect' && clip.patternInvert)) {
                    // Write directly to frameData, no intermediate alloc
                    this.renderClip(clip, clipTime, frameData, row, col, gridSize, layer, adjustedTime);
                }
            }
        }

        return frameData;
    }

    /**
     * Calculate time offset for wave pattern
     */
    calculateWaveOffset(row, col, direction, speed, gridSize, invert = false) {
        let distance;
        const dir = direction || 'right';

        // Logical "Forward" directions
        let effectiveDir = dir;
        if (invert) {
            const opposites = {
                'right': 'left', 'left': 'right',
                'up': 'down', 'down': 'up',
                'horizontal': 'left', 'vertical': 'up',
                'down-right': 'up-left', 'up-left': 'down-right',
                'down-left': 'up-right', 'up-right': 'down-left',
                'diagonal-right': 'up-left', 'diagonal-left': 'up-right'
            };
            effectiveDir = opposites[dir] || dir;
        }

        switch (effectiveDir) {
            case 'right':
            case 'horizontal': // legacy
                distance = col;
                break;
            case 'left':
                distance = (gridSize.cols - col - 1);
                break;
            case 'down':
            case 'vertical': // legacy
                distance = row;
                break;
            case 'up':
                distance = (gridSize.rows - row - 1);
                break;
            case 'down-right':
            case 'diagonal-right': // legacy
                distance = row + col;
                break;
            case 'down-left':
            case 'diagonal-left': // legacy
                distance = row + (gridSize.cols - col - 1);
                break;
            case 'up-right':
                distance = (gridSize.rows - row - 1) + col;
                break;
            case 'up-left':
                distance = (gridSize.rows - row - 1) + (gridSize.cols - col - 1);
                break;
            default:
                distance = 0;
        }
        return distance * (100 / speed); // ms delay per grid unit
    }

    /**
     * Calculate time offset for sequential pattern
     */
    calculateSequentialOffset(row, col, direction, speed, gridSize = null, invert = false) {
        let dir = direction || 'row-by-row';
        const isRow = dir === 'row-by-row';
        let index = isRow ? row : col;

        if (invert && gridSize) {
            const max = isRow ? gridSize.rows : gridSize.cols;
            index = max - index - 1;
        }
        return index * (200 / speed);
    }

    /**
     * Calculate time offset for radial pattern
     */
    calculateRadialOffset(row, col, direction, speed, gridSize, corrected = false, invert = false) {
        const centerRow = gridSize.rows / 2;
        const centerCol = gridSize.cols / 2;

        // Correct for 1:2 row:col ratio if requested
        const rowMult = corrected ? 2.0 : 1.0;

        let distance = Math.sqrt(
            Math.pow((row - centerRow) * rowMult, 2) +
            Math.pow(col - centerCol, 2)
        );

        const maxDistance = Math.sqrt(
            Math.pow(centerRow * rowMult, 2) +
            Math.pow(centerCol, 2)
        );

        const dir = direction || 'outward';
        let type = String(dir).split('-')[0]; // inward, outward

        if (invert) {
            type = type === 'outward' ? 'inward' : 'outward';
        }

        if (type === 'outward') {
            return distance * (100 / speed);
        } else { // inward
            return (maxDistance - distance) * (100 / speed);
        }
    }

    /**
     * Calculate time offset for dissolve pattern (legacy, speed-based)
     */
    calculateDissolveOffset(row, col, clipId, speed, timeMs, invert = false) {
        // High frequency dissolve: use timeMs to jump the offset frequently
        const timeFactor = Math.floor(timeMs * (speed || 1) / 50);
        const seed = (row * 31 + col) * 17 + (parseInt(clipId.substring(0, 8), 16) || 0) + timeFactor;
        const rand = Math.sin(seed) * 10000;
        let normalized = rand - Math.floor(rand);
        if (invert) normalized = 1.0 - normalized;
        return normalized * 1000;
    }

    // ═══════════════════════════════════════════════════════════════
    //  NEW PATTERNS — Duration-based (offset fills clip.duration)
    // ═══════════════════════════════════════════════════════════════

    /**
     * Directional: direction-based wave that auto-scales to clip duration.
     * 8 cardinal/ordinal directions.  normalizedDistance ∈ [0, 1]
     */
    calculateDurationWaveOffset(row, col, direction, duration, gridSize, invert = false) {
        let dir = direction || 'to-right';

        if (invert) {
            const opposites = {
                'to-right': 'to-left', 'to-left': 'to-right',
                'to-down': 'to-up', 'to-up': 'to-down',
                'to-down-right': 'to-up-left', 'to-up-left': 'to-down-right',
                'to-down-left': 'to-up-right', 'to-up-right': 'to-down-left',
            };
            dir = opposites[dir] || dir;
        }

        let distance, maxDistance;
        switch (dir) {
            case 'to-left':
                distance = col;
                maxDistance = gridSize.cols - 1; break;
            case 'to-right':
                distance = gridSize.cols - col - 1;
                maxDistance = gridSize.cols - 1; break;
            case 'to-up':
                distance = row;
                maxDistance = gridSize.rows - 1; break;
            case 'to-down':
                distance = gridSize.rows - row - 1;
                maxDistance = gridSize.rows - 1; break;
            case 'to-up-left':
                distance = row + col;
                maxDistance = (gridSize.rows - 1) + (gridSize.cols - 1); break;
            case 'to-down-right':
                distance = (gridSize.rows - row - 1) + (gridSize.cols - col - 1);
                maxDistance = (gridSize.rows - 1) + (gridSize.cols - 1); break;
            case 'to-down-left':
                distance = (gridSize.rows - row - 1) + col;
                maxDistance = (gridSize.rows - 1) + (gridSize.cols - 1); break;
            case 'to-up-right':
                distance = row + (gridSize.cols - col - 1);
                maxDistance = (gridSize.rows - 1) + (gridSize.cols - 1); break;
            // Legacy fallbacks for old clips
            case 'right': distance = gridSize.cols - col - 1; maxDistance = gridSize.cols - 1; break;
            case 'left': distance = col; maxDistance = gridSize.cols - 1; break;
            case 'down': distance = gridSize.rows - row - 1; maxDistance = gridSize.rows - 1; break;
            case 'up': distance = row; maxDistance = gridSize.rows - 1; break;
            default:
                distance = 0; maxDistance = 1;
        }
        const normalized = maxDistance > 0 ? distance / maxDistance : 0;
        return normalized * duration;
    }

    /**
     * New Radial: circle-corrected radial that auto-scales to clip duration.
     */
    calculateDurationRadialOffset(row, col, direction, duration, gridSize, invert = false) {
        const centerRow = gridSize.rows / 2;
        const centerCol = gridSize.cols / 2;
        // Always correct for 1:2 aspect ratio
        const rowMult = 2.0;

        const distance = Math.sqrt(
            Math.pow((row - centerRow) * rowMult, 2) +
            Math.pow(col - centerCol, 2)
        );
        const maxDistance = Math.sqrt(
            Math.pow(centerRow * rowMult, 2) +
            Math.pow(centerCol, 2)
        );

        let type = direction || 'close';
        if (invert) {
            type = type === 'close' ? 'open' : 'close';
        }

        let normalized;
        if (type === 'close' || type === 'outward') {
            normalized = maxDistance > 0 ? distance / maxDistance : 0;
        } else {
            // open or inward
            normalized = maxDistance > 0 ? (maxDistance - distance) / maxDistance : 0;
        }
        return normalized * duration;
    }

    /**
     * Curtain (duration-based): expands from the center axis outwards.
     */
    calculateDurationCurtainOffset(row, col, direction, duration, gridSize) {
        let normalized;
        if (direction === 'vert-close') {
            const center = (gridSize.rows - 1) / 2;
            const maxDist = Math.max(center, gridSize.rows - 1 - center);
            const dist = Math.abs(row - center);
            normalized = maxDist > 0 ? dist / maxDist : 0;
        } else if (direction === 'vert-open') {
            const center = (gridSize.rows - 1) / 2;
            const maxDist = Math.max(center, gridSize.rows - 1 - center);
            const dist = Math.abs(row - center);
            normalized = maxDist > 0 ? (maxDist - dist) / maxDist : 0;
        } else if (direction === 'horiz-open') {
            const center = (gridSize.cols - 1) / 2;
            const maxDist = Math.max(center, gridSize.cols - 1 - center);
            const dist = Math.abs(col - center);
            normalized = maxDist > 0 ? (maxDist - dist) / maxDist : 0;
        } else {
            // horiz-close (default)
            const center = (gridSize.cols - 1) / 2;
            const maxDist = Math.max(center, gridSize.cols - 1 - center);
            const dist = Math.abs(col - center);
            normalized = maxDist > 0 ? dist / maxDist : 0;
        }
        return normalized * duration;
    }

    /**
     * Diamond: Manhattan distance expansion/collapse, corrected for aspect ratio.
     */
    calculateDurationDiamondOffset(row, col, direction, duration, gridSize) {
        const centerR = (gridSize.rows - 1) / 2;
        const centerC = (gridSize.cols - 1) / 2;

        // Normalized axial distances [0, 1]
        const normY = centerR > 0 ? Math.abs(row - centerR) / centerR : 0;
        const normX = centerC > 0 ? Math.abs(col - centerC) / centerC : 0;

        let dist, maxDist;
        if (direction && direction.includes('straight')) {
            // Chebyshev distance (Square)
            dist = Math.max(normY, normX);
            maxDist = 1.0;
        } else {
            // Manhattan distance (Diamond)
            dist = normY + normX;
            maxDist = 2.0;
        }

        let normalized;
        if (direction && direction.includes('open')) { // edges to center
            normalized = (maxDist - dist) / maxDist;
        } else { // close (center to edges)
            normalized = dist / maxDist;
        }
        return Math.max(0, Math.min(1, normalized)) * duration;
    }


    /**
     * Zig-Zag: Serpentine motion across rows or columns.
     */
    calculateDurationZigZagOffset(row, col, direction, duration, gridSize) {
        let index, total;
        const maxR = gridSize.rows - 1;
        const maxC = gridSize.cols - 1;

        if (direction === 'vertical') {
            const isColReverse = col % 2 !== 0;
            const rowPos = isColReverse ? (maxR - row) : row;
            index = col * (maxR + 1) + rowPos;
            total = (maxC + 1) * (maxR + 1) - 1;
        } else { // horizontal
            const isRowReverse = row % 2 !== 0;
            const colPos = isRowReverse ? (maxC - col) : col;
            index = row * (maxC + 1) + colPos;
            total = (maxR + 1) * (maxC + 1) - 1;
        }
        const normalized = total > 0 ? index / total : 0;
        return normalized * duration;
    }

    /**
     * Box Spiral: Winding path through concentric squares, corrected for aspect ratio.
     */
    calculateDurationBoxSpiralOffset(row, col, direction, duration, gridSize) {
        const centerR = Math.floor((gridSize.rows - 1) / 2);
        const centerC = Math.floor((gridSize.cols - 1) / 2);

        let dr = col - centerC;
        let dc = row - centerR;

        if (direction && direction.includes('tilted')) {
            // Rotate 45 deg: (x+y), (y-x)
            const rX = dr + dc;
            const rC = dc - dr;
            dr = rX;
            dc = rC;
        }

        // Use raw distance to find shell to avoid float precision issues at boundaries
        const shell = Math.max(Math.abs(dr), Math.abs(dc));

        // Calculate a continuous winding value derived from position on the perimeter
        let perimeterVal = 0;
        if (shell > 0) {
            if (dr === shell && dc > -shell) { // Right side
                perimeterVal = 0.5 + (dc / shell) * 0.5; // [0.5, 1.0] -> 0.125 to 0.25 of total circle
                perimeterVal = 1 + (dc / shell); // [0, 2]
            } else if (dc === shell) { // Bottom side
                perimeterVal = 3 + (shell - dr) / shell; // [2, 4]
                perimeterVal = 4 - (dr / shell); // [3, 5]
            } else if (dr === -shell) { // Left side
                perimeterVal = 6 - (dc / shell); // [5, 7]
            } else { // Top side
                perimeterVal = 7 + (dr / shell); // [7, 8]
            }
        }

        // More robust winding map: 0 to 8 per shell
        let winding;
        if (shell === 0) {
            winding = 0;
        } else {
            // Detect side using cleaner thresholds
            const absX = Math.abs(dr);
            const absY = Math.abs(dc);

            if (dr === shell && dc > -shell) winding = 1 + (dc / shell);
            else if (dc === shell) winding = 3 + (shell - dr) / shell;
            else if (dr === -shell) winding = 5 + (shell - dc) / shell;
            else winding = 7 + (shell + dr) / shell;
        }

        // Normalize based on max shell size
        const maxShell = Math.max(centerR, centerC) || 1;
        const normalizedShell = shell / maxShell;
        const normalizedWinding = winding / 8; // 0 to 1 around the shell

        // Combine shell and winding for smooth fill
        const dist = normalizedShell * 0.9 + (normalizedWinding * 0.1 / Math.max(1, shell));

        // Simplified robust normalization: (Shell growth + Winding order)
        const finalDist = (shell + winding / 8) / (maxShell + 1);

        let final;
        if (direction && direction.includes('open')) {
            final = 1.0 - finalDist;
        } else {
            final = finalDist;
        }

        return Math.max(0, Math.min(1, final)) * duration;
    }

    /**
     * Interlace: Alternating lines moving in opposite directions.
     */
    calculateDurationInterlaceOffset(row, col, direction, duration, gridSize) {
        const maxR = gridSize.rows - 1;
        const maxC = gridSize.cols - 1;
        let dist, maxDist;

        if (direction === 'vertical') {
            const isColOdd = col % 2 !== 0;
            dist = isColOdd ? (maxR - row) : row;
            maxDist = maxR;
        } else { // horizontal
            const isRowOdd = row % 2 !== 0;
            dist = isRowOdd ? (maxC - col) : col;
            maxDist = maxC;
        }
        const normalized = maxDist > 0 ? dist / maxDist : 0;
        return normalized * duration;
    }

    /**
     * Raindrops: Fixed random seed per car for clip lifetime.
     */
    calculateDurationRaindropsOffset(row, col, clipId, duration) {
        const clipBase = parseInt(String(clipId).substring(0, 8), 16) || 0;
        let h = (row * 1013 + col * 67 + clipBase) >>> 0;

        h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
        h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
        h ^= h >>> 16;
        const rand = (h >>> 0) / 4294967296;

        return rand * duration;
    }

    /**
     * Dissolve (duration-based): random flicker that auto-scales to duration.
     */
    calculateDurationDissolveOffset(row, col, clipId, duration, timeMs, invert = false) {
        const timeFactor = Math.floor(timeMs / 50);
        const seed = (row * 31 + col) * 17 + (parseInt(clipId.substring(0, 8), 16) || 0) + timeFactor;
        const rand = Math.sin(seed) * 10000;
        let normalized = rand - Math.floor(rand);
        if (invert) normalized = 1.0 - normalized;
        return normalized * duration;
    }

    calculateDurationNoiseOffset(row, col, clipId, duration, timeMs, density = 0.5, interval = 100) {
        const intervalMs = Math.max(20, interval || 100);
        const timeFactor = Math.floor(timeMs / intervalMs);

        // Robust integer-based hash for predictable randomness
        const clipBase = parseInt(String(clipId).substring(0, 8), 16) || 0;
        let h = (row * 1013 + col * 67 + timeFactor * 123 + clipBase) >>> 0;

        // Simple but effective MurmurHash-style mixer
        h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
        h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
        h ^= h >>> 16;

        // Normalize to 0-1
        const rand = (h >>> 0) / 4294967296;

        // Density fallback
        const d = (density === undefined || density === null) ? 0.5 : Number(density);

        if (rand < d) {
            return 0; // Active car
        } else {
            // Far out of range to ensure it stays OFF
            return duration + 10000;
        }
    }

    renderLayer(layer, timeMs) {
        const frame = new Uint8Array(CHANNEL_COUNT).fill(0);

        // Find active clips at this time
        let activeClips = [];
        if (layer.isMidi && layer.midiData) {
            const regionClip = layer.clips.find(c => c.type === 'midi-region' && timeMs >= c.startTime && timeMs < (c.startTime + c.duration));
            if (regionClip) {
                const localTimeMs = timeMs - regionClip.startTime + (regionClip.startOffset || 0);
                for (const note of layer.midiData) {
                    if (localTimeMs >= note.time && localTimeMs < (note.time + note.duration)) {
                        const mappedFxData = layer.midiMappings?.[note.midi];
                        if (mappedFxData) {
                            let mappedFx = mappedFxData;
                            if (Array.isArray(mappedFxData) && mappedFxData.length > 0) {
                                const hash = Math.abs(Math.sin(note.time * 12.9898 + note.midi * 78.233)) * 10000;
                                const selectedIdx = Math.floor(hash) % mappedFxData.length;
                                mappedFx = mappedFxData[selectedIdx];
                            }

                            const rawStartTime = regionClip.startTime + note.time - (regionClip.startOffset || 0);
                            const clampedStartTime = Math.max(regionClip.startTime, rawStartTime);

                            activeClips.push({
                                ...mappedFx,
                                startTime: clampedStartTime,
                                duration: note.duration - (clampedStartTime - rawStartTime),
                                id: `midi-${note.midi}-${note.time}`
                            });
                        }
                    }
                }
            }
        } else {
            activeClips = layer.clips.filter(c =>
                timeMs >= c.startTime &&
                timeMs < (c.startTime + c.duration)
            );
        }

        for (const clip of activeClips) {
            const clipTime = timeMs - clip.startTime;
            this.renderClip(clip, clipTime, frame, null, null, null, layer, timeMs);
        }

        return frame;
    }

    renderClip(clip, clipTime, frame, row = null, col = null, gridSize = null, layer = null, globalTimeMs = null) {
        // Tesla Ramping Magic Values (0-255)
        const RAMP_ON_VALUES = { 0: 255, 500: 178, 1000: 204, 2000: 229 };
        const RAMP_OFF_VALUES = { 0: 0, 500: 25, 1000: 51, 2000: 76 };

        let intensity = 1.0;
        let isDuringRamping = false;
        let rampingValue = 255;

        const freq = clip.speed || 5;
        const pulseDur = clip.effectType === 'strobe' ? (1000 / (2 * freq)) : clip.duration;

        const rampOnDur = clip.rampingEnabled ? (clip.rampOnDuration || 0) : 0;
        const rampOffDur = clip.rampingEnabled ? (clip.rampOffDuration || 0) : 0;

        // Safety: Disable ramping if pulse is too short
        const canRamp = clip.rampingEnabled && (pulseDur >= (rampOnDur + rampOffDur));

        if (canRamp) {
            if (rampOnDur > 0 && clipTime < rampOnDur) {
                isDuringRamping = true;
                rampingValue = RAMP_ON_VALUES[rampOnDur] || 255;
            } else if (rampOffDur > 0 && clipTime > (clip.duration - rampOffDur)) {
                isDuringRamping = true;
                rampingValue = RAMP_OFF_VALUES[rampOffDur] || 0;
            } else {
                rampingValue = 255; // Steady state
            }
        } else {
            // Standard linear fade (legacy/fallback)
            if (clipTime < clip.fadeIn) {
                intensity = clipTime / clip.fadeIn;
            } else if (clipTime > (clip.duration - clip.fadeOut)) {
                intensity = Math.max(0, (clip.duration - clipTime) / clip.fadeOut);
            }
            rampingValue = Math.floor(255 * intensity);
        }

        if (clip.type === 'effect') {
            this.renderEffect(clip, clipTime, rampingValue, frame);
        } else if (clip.type === 'gif') {
            const r = row !== null ? row : 0;
            const c = col !== null ? col : 0;
            const gs = gridSize !== null ? gridSize : { rows: 1, cols: 1 };
            // GIFs bypass ramping/fade calculations and use full intensity
            this.renderPatternForPosition(clip, clipTime, 1.0, frame, r, c, gs, layer, globalTimeMs);
        } else if (clip.type === 'eq') {
            const r = row !== null ? row : 0;
            const c = col !== null ? col : 0;
            const gs = gridSize !== null ? gridSize : { rows: 1, cols: 1 };
            const time = globalTimeMs !== null ? globalTimeMs : (clip.startTime + clipTime);
            this.renderEq(clip, clipTime, time, frame, r, c, gs, layer);
        }
    }

    renderEq(clip, clipTime, timeMs, frame, row, col, gridSize, layer) {
        if (!this.project || !this.project.waveform || !this.project.waveform.spectrogram) return;

        const spec = this.project.waveform.spectrogram;
        const steps = spec.length;
        if (steps === 0) return;

        const updateInterval = clip.updateInterval || 20;
        const effectiveTimeMs = Math.floor((timeMs + (clip.eqTimeOffset || 0)) / updateInterval) * updateInterval;

        const audioDuration = this.project.waveform.duration || this.project.duration;
        const pointsPerSecond = steps / (audioDuration / 1000);
        const index = Math.min(steps - 1, Math.max(0, Math.floor((effectiveTimeMs / 1000) * pointsPerSecond)));

        const currentSpec = spec[index];
        if (!currentSpec) return;

        const numBins = currentSpec.length;

        const bands = clip.bands || [];
        for (let i = 0; i < (clip.bandCount || 1); i++) {
            const band = bands[i];
            if (!band) continue;

            let startBin = 0;
            let endBin = numBins - 1;

            if (band.minBin !== undefined && band.maxBin !== undefined) {
                // New direct bin targeting (0-31)
                startBin = Math.max(0, Math.min(numBins - 1, band.minBin));
                endBin = Math.max(0, Math.min(numBins - 1, band.maxBin));
            } else {
                // Legacy fallback for old projects with Hz values
                const maxFreqBin = this.project.waveform.fftSampleRate ? this.project.waveform.fftSampleRate / 2 : 22050;
                const hzPerBin = maxFreqBin / numBins;
                const minFreq = band.minFreq || 0;
                const maxFreq = band.maxFreq || 20000;

                // Approximate legacy mapping onto the new 32-bin log scale is tough, 
                // so we do a simple linear fallback here just to not crash
                startBin = Math.floor(minFreq / hzPerBin);
                endBin = Math.min(numBins - 1, Math.ceil(maxFreq / hzPerBin));
            }

            // Ensure start <= end
            if (startBin > endBin) {
                const temp = startBin;
                startBin = endBin;
                endBin = temp;
            }

            let sum = 0;
            let count = 0;
            for (let b = startBin; b <= endBin; b++) {
                sum += currentSpec[b];
                count++;
            }
            let avgVol = count > 0 ? (sum / count) / 255.0 : 0;

            const scale = band.maxScale || 1.0;
            const cutOff = band.minCutoff || 0;

            // Values are pre-normalized to 0-255, so divided by 255 they perfectly fit the 0.0-1.0 range.
            let baseVol = avgVol;
            baseVol = baseVol - cutOff;
            if (baseVol < 0) baseVol = 0;
            avgVol = baseVol * scale;

            if (clip.decay && clip.decay > 0) {
                const lookbackMs = 500;
                const framesToLookBack = Math.floor((lookbackMs / 1000) * pointsPerSecond);
                let currentPeak = avgVol;

                for (let prev = 1; prev <= framesToLookBack; prev++) {
                    const pastIndex = index - prev;
                    if (pastIndex >= 0 && spec[pastIndex]) {
                        let pSum = 0;
                        for (let b = startBin; b <= endBin; b++) {
                            pSum += spec[pastIndex][b];
                        }
                        let pBase = ((pSum / count) / 255.0) - cutOff;
                        if (pBase < 0) pBase = 0;
                        let pVol = pBase * scale;

                        // Decay ranges typically 0 to 1. A decay of 0.1 means it loses 10% per frame.
                        const decayFactor = Math.pow(1 - clip.decay, prev);
                        const decayedPastVol = pVol * decayFactor;
                        if (decayedPastVol > currentPeak) {
                            currentPeak = decayedPastVol;
                        }
                    }
                }
                avgVol = currentPeak;
            } else if (clip.peakHold) {
                const framesToLookBack = Math.floor(2.0 * pointsPerSecond);
                let highest = avgVol;
                for (let prev = 1; prev <= framesToLookBack; prev++) {
                    const pastIndex = index - prev;
                    if (pastIndex >= 0 && spec[pastIndex]) {
                        let pSum = 0;
                        for (let b = startBin; b <= endBin; b++) {
                            pSum += spec[pastIndex][b];
                        }
                        let pBase = ((pSum / count) / 255.0) - cutOff;
                        if (pBase < 0) pBase = 0;
                        let pVol = pBase * scale;
                        if (pVol > highest) highest = pVol;
                    }
                }
                avgVol = highest;
            }

            let intensity = Math.min(1.0, Math.max(0, avgVol));

            const hasImage = !!(band.imageId && this.project.assets[band.imageId]);
            let pixelSensitivity = 0;

            if (hasImage && this.project.assets[band.imageId].frames?.length > 0) {
                const asset = this.project.assets[band.imageId];
                const totalFrames = asset.frames.length;

                // Multi-frame: select frame based on volume intensity
                let frameIndex = 0;
                if (totalFrames > 1) {
                    frameIndex = Math.min(totalFrames - 1, Math.floor(intensity * totalFrames));
                }

                const imageData = asset.frames[frameIndex];
                const targetRow = row !== null ? row : 0;
                const targetCol = col !== null ? col : 0;
                const gs = { rows: gridSize?.rows || 10, cols: gridSize?.cols || 10 };
                const disableTiling = clip.disableTiling || false;

                const [rCol, gCol, bCol, aCol] = this.getImagePixel1to1(imageData, targetRow, targetCol, gs, 0, 0, disableTiling);

                const luminance = (0.299 * rCol + 0.587 * gCol + 0.114 * bCol) * (aCol / 255);
                pixelSensitivity = luminance / 255;

                // Invert image mapping if enabled
                if (band.invertImage) {
                    pixelSensitivity = 1.0 - pixelSensitivity;
                }
            }

            const targets = this.resolveTargetChannels(clip);
            if (targets.length === 0) continue;

            let finalBrightness = 0;

            if (hasImage) {
                if (intensity >= pixelSensitivity && pixelSensitivity > 0) {
                    finalBrightness = 255;
                }
            } else {
                if (intensity > 0) {
                    finalBrightness = 255;
                }
            }

            if (finalBrightness > 0) {
                this.applyToChannels(targets, finalBrightness, frame);
            }
        }
    }

    renderEffect(clip, clipTime, value, frame) {
        const targetChannels = this.resolveTargetChannels(clip);

        if (targetChannels.length === 0) return;

        let brightness = 0;
        const isInRange = clipTime >= 0 && clipTime < clip.duration;

        if (isInRange) {
            if (clip.effectType === 'flash') {
                brightness = value;
            } else if (clip.effectType === 'strobe' || clip.effectType === 'pulse') {
                const freq = clip.speed || 5;
                const isOn = Math.floor(clipTime / 1000 * 2 * freq) % 2 === 0;
                brightness = isOn ? value : 0;
            }
        } else {
            // Out of range (due to pattern offset) means effectively OFF in normal mode
            brightness = 0;
        }

        // Apply Inversion: 0 -> 255, 255 -> 0
        if (clip.patternInvert) {
            brightness = 255 - brightness;
        }

        if (brightness > 0) {
            this.applyToChannels(targetChannels, brightness, frame);
        }
    }

    /**
     * Resolve target channel indices for a clip based on its group selection or legacy channels
     */
    resolveTargetChannels(clip) {
        const groups = this.project?.lightGroups || {};
        const activeGroups = clip.targetLightGroups;

        if (Array.isArray(activeGroups)) {
            if (activeGroups.length === 0) return [];

            const resolved = new Set();
            activeGroups.forEach(name => {
                const group = groups[name];
                if (group) {
                    const chs = Array.isArray(group) ? group : (group.channels || []);
                    chs.forEach(ch => resolved.add(ch));
                }
            });
            return Array.from(resolved);
        }

        // Fallback to legacy channels if no symbolic groups are selected
        return clip.channels || [];
    }

    /**
     * Render pattern for a specific grid position
     */
    renderPatternForPosition(clip, clipTime, intensity, frame, row, col, gridSize, layer, globalTimeMs = null) {
        if (!clip.assetId || !this.project?.assets[clip.assetId]) return;

        const asset = this.project.assets[clip.assetId];
        const frameDuration = clip.timingMode === 'beat'
            ? (60000 / (clip.bpm || 120)) * (clip.beatsPerFrame || 1)
            : (clip.frameDuration || 100);

        const assetFrameCount = asset.frames.length;
        const rawFrameIndex = Math.floor(clipTime / frameDuration);
        const frameIndex = (rawFrameIndex < 0) ? 0 : (rawFrameIndex % assetFrameCount);

        // Get animated offset for current clip time uniformly across the grid
        const baseClipTime = globalTimeMs !== null ? (globalTimeMs - clip.startTime) : clipTime;
        const offset = this.getAnimatedOffset(clip, baseClipTime);

        // --- Transition blending logic ---
        const transType = clip.transitionType || 'none';
        const transOverlap = clip.transitionOverlap || 0.5;
        const timeInFrame = clipTime - rawFrameIndex * frameDuration;
        const transitionStart = frameDuration * (1.0 - transOverlap);

        let r, g, b, a;
        const disableTiling = clip.disableTiling || false;
        const flipH = clip.flipHorizontal || false;
        const flipV = clip.flipVertical || false;

        if (transType !== 'none' && timeInFrame >= transitionStart && transOverlap > 0) {
            const absFrameIndex = rawFrameIndex < 0 ? 0 : rawFrameIndex;
            const nextAbsFrameIndex = absFrameIndex + 1;
            const nextFrameIdx = ((rawFrameIndex < 0 ? 0 : rawFrameIndex) + 1) % assetFrameCount;
            const wouldWrap = (nextFrameIdx <= frameIndex);
            const nextFrameStartTime = ((rawFrameIndex < 0 ? 0 : rawFrameIndex) + 1) * frameDuration;
            const isLastPlayableFrame = wouldWrap && (nextFrameStartTime >= clip.duration - 1);

            if (isLastPlayableFrame) {
                const currentImageData = asset.frames[frameIndex];
                [r, g, b, a] = this.getImagePixel1to1(currentImageData, row, col, gridSize, offset.x, offset.y, disableTiling, flipH, flipV);
            } else {
                const nextFrameIndex = nextAbsFrameIndex % assetFrameCount;
                const currentImageData = asset.frames[frameIndex];
                const nextImageData = asset.frames[nextFrameIndex];
                const transitionDuration = frameDuration * transOverlap;
                const progress = Math.min(1.0, (timeInFrame - transitionStart) / transitionDuration);

                const [cr, cg, cb, ca] = this.getImagePixel1to1(currentImageData, row, col, gridSize, offset.x, offset.y, disableTiling, flipH, flipV);
                const [nr, ng, nb, na] = this.getImagePixel1to1(nextImageData, row, col, gridSize, offset.x, offset.y, disableTiling, flipH, flipV);

                // ... rest of transition logic ...
                if (transType === 'dissolve') {
                    const temporalStep = Math.floor(clipTime / 20);
                    let seed = row * 374761 + col * 668265 + rawFrameIndex * 93481 + temporalStep * 27183;
                    seed = ((seed >>> 16) ^ seed) * 0x45d9f3b;
                    seed = ((seed >>> 16) ^ seed) * 0x45d9f3b;
                    seed = (seed >>> 16) ^ seed;
                    const hash = (seed & 0x7fffffff) / 0x7fffffff;
                    if (hash < progress) { r = nr; g = ng; b = nb; a = na; }
                    else { r = cr; g = cg; b = cb; a = ca; }
                } else if (transType.startsWith('wipe-')) {
                    let normPos;
                    if (transType === 'wipe-right') normPos = gridSize.cols > 1 ? col / (gridSize.cols - 1) : 0.5;
                    else if (transType === 'wipe-left') normPos = gridSize.cols > 1 ? 1.0 - col / (gridSize.cols - 1) : 0.5;
                    else if (transType === 'wipe-down') normPos = gridSize.rows > 1 ? row / (gridSize.rows - 1) : 0.5;
                    else normPos = gridSize.rows > 1 ? 1.0 - row / (gridSize.rows - 1) : 0.5;
                    if (normPos < progress) { r = nr; g = ng; b = nb; a = na; }
                    else { r = cr; g = cg; b = cb; a = ca; }
                } else if (transType.startsWith('push-')) {
                    const totalCols = gridSize.cols;
                    const shiftAmount = Math.floor(progress * totalCols);
                    if (transType === 'push-right') {
                        const srcCol = col - shiftAmount;
                        if (srcCol < 0) [r, g, b, a] = this.getImagePixel1to1(nextImageData, row, totalCols + srcCol, gridSize, offset.x, offset.y, disableTiling, flipH, flipV);
                        else[r, g, b, a] = this.getImagePixel1to1(currentImageData, row, srcCol, gridSize, offset.x, offset.y, disableTiling, flipH, flipV);
                    } else {
                        const srcCol = col + shiftAmount;
                        if (srcCol >= totalCols) [r, g, b, a] = this.getImagePixel1to1(nextImageData, row, srcCol - totalCols, gridSize, offset.x, offset.y, disableTiling, flipH, flipV);
                        else[r, g, b, a] = this.getImagePixel1to1(currentImageData, row, srcCol, gridSize, offset.x, offset.y, disableTiling, flipH, flipV);
                    }
                } else {
                    r = cr; g = cg; b = cb; a = ca;
                }
            }
        } else {
            // No transition — use current frame
            const imageData = asset.frames[frameIndex];
            [r, g, b, a] = this.getImagePixel1to1(imageData, row, col, gridSize, offset.x, offset.y, disableTiling, flipH, flipV);
        }

        let baseLuminance = (0.299 * r + 0.587 * g + 0.114 * b);
        if (clip.invertImage) baseLuminance = 255 - baseLuminance;
        const luminance = baseLuminance * (a / 255);
        const val = Math.floor(luminance * intensity);
        const targets = this.resolveTargetChannels(clip);
        this.applyToChannels(targets, val, frame);
    }

    applyToChannels(channels, value, frame) {
        if (!channels) return;
        channels.forEach(ch => {
            if (frame[ch] !== undefined) {
                frame[ch] = Math.max(frame[ch], value);
            }
        });
    }
}

