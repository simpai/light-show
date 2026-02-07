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

export class ShowRenderer {
    constructor() {
        this.project = null;
        this.matrixMode = false;
        this.matrixConfig = { rows: 10, cols: 10 };
        this.jitterSeed = Math.random();
    }

    setJitterSeed(seed) {
        this.jitterSeed = seed;
    }

    setProject(project) {
        this.project = project;
    }

    setMatrixMode(enabled, config = { rows: 10, cols: 10 }) {
        this.matrixMode = enabled;
        this.matrixConfig = config;
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
        const { rows, cols } = config || this.matrixConfig;
        const grid = [];

        if (!this.project) {
            // Return empty grid
            for (let r = 0; r < rows; r++) {
                grid[r] = [];
                for (let c = 0; c < cols; c++) {
                    grid[r][c] = new Uint8Array(CHANNEL_COUNT).fill(0);
                }
            }
            return grid;
        }

        // Check if any clip uses position-based patterns or is a gif type
        let hasPositionPattern = false;
        for (const layer of this.project.layers) {
            for (const clip of layer.clips) {
                if ((clip.pattern && clip.pattern !== 'uniform') || clip.type === 'gif') {
                    hasPositionPattern = true;
                    break;
                }
            }
            if (hasPositionPattern) break;
        }

        if (!hasPositionPattern) {
            // Use optimized uniform rendering
            const baseFrame = this.getFrame(timeMs);
            for (let r = 0; r < rows; r++) {
                grid[r] = [];
                for (let c = 0; c < cols; c++) {
                    grid[r][c] = new Uint8Array(baseFrame);
                }
            }
        } else {
            // Position-based rendering
            for (let r = 0; r < rows; r++) {
                grid[r] = [];
                for (let c = 0; c < cols; c++) {
                    grid[r][c] = this.getFrameForPosition(timeMs, r, c, { rows, cols });
                }
            }
        }

        return grid;
    }

    /**
     * Get frame data for a specific position in the grid
     */
    getFrameForPosition(timeMs, row, col, gridSize) {
        if (!this.project) return new Uint8Array(CHANNEL_COUNT).fill(0);

        const frameData = new Uint8Array(CHANNEL_COUNT).fill(0);

        for (const layer of this.project.layers) {
            if (layer.muted) continue;

            // Find active clip at this time
            const clip = layer.clips.find(c =>
                timeMs >= c.startTime &&
                timeMs < (c.startTime + c.duration)
            );

            if (clip) {
                // Filter by Car Group if applicable
                if (clip.carGroupId) {
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
                    switch (clip.pattern) {
                        case 'wave':
                            timeOffset = this.calculateWaveOffset(row, col, clip.patternDirection, clip.patternSpeed || 1, gridSize);
                            break;
                        case 'sequential':
                            timeOffset = this.calculateSequentialOffset(row, col, clip.patternDirection, clip.patternSpeed || 1);
                            break;
                        case 'radial':
                            timeOffset = this.calculateRadialOffset(row, col, clip.patternDirection, clip.patternSpeed || 1, gridSize);
                            break;
                    }
                }

                const adjustedTime = timeMs + timeOffset + jitterOffset;
                const clipTime = adjustedTime - clip.startTime;

                // Only render if within clip duration
                if (clipTime >= 0 && clipTime < clip.duration) {
                    const cellFrame = new Uint8Array(CHANNEL_COUNT).fill(0);
                    this.renderClip(clip, clipTime, cellFrame, row, col, gridSize, layer);

                    // Mix into frame
                    for (let i = 0; i < CHANNEL_COUNT; i++) {
                        frameData[i] = Math.max(frameData[i], cellFrame[i]);
                    }
                }
            }
        }

        return frameData;
    }

    /**
     * Calculate time offset for wave pattern
     */
    calculateWaveOffset(row, col, direction, speed, gridSize) {
        let distance;
        switch (direction) {
            case 'horizontal':
                distance = col;
                break;
            case 'vertical':
                distance = row;
                break;
            case 'diagonal-right':
                distance = row + col;
                break;
            case 'diagonal-left':
                distance = row + (gridSize.cols - col - 1);
                break;
            default:
                distance = 0;
        }
        return distance * (100 / speed); // ms delay per grid unit
    }

    /**
     * Calculate time offset for sequential pattern
     */
    calculateSequentialOffset(row, col, direction, speed) {
        const index = direction === 'row-by-row' ? row : col;
        return index * (200 / speed); // ms delay between rows/cols
    }

    /**
     * Calculate time offset for radial pattern
     */
    calculateRadialOffset(row, col, direction, speed, gridSize) {
        const centerRow = gridSize.rows / 2;
        const centerCol = gridSize.cols / 2;
        const distance = Math.sqrt(
            Math.pow(row - centerRow, 2) +
            Math.pow(col - centerCol, 2)
        );
        const maxDistance = Math.sqrt(
            Math.pow(centerRow, 2) +
            Math.pow(centerCol, 2)
        );

        if (direction === 'outward') {
            return distance * (100 / speed);
        } else { // inward
            return (maxDistance - distance) * (100 / speed);
        }
    }

    renderLayer(layer, timeMs) {
        const frame = new Uint8Array(CHANNEL_COUNT).fill(0);

        // Find active clip at this time
        const clip = layer.clips.find(c =>
            timeMs >= c.startTime &&
            timeMs < (c.startTime + c.duration)
        );

        if (clip) {
            const clipTime = timeMs - clip.startTime;
            this.renderClip(clip, clipTime, frame, null, null, null, layer);
        }

        return frame;
    }

    renderClip(clip, clipTime, frame, row = null, col = null, gridSize = null, layer = null) {
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
            this.renderPatternForPosition(clip, clipTime, 1.0, frame, r, c, gs, layer);
        }
    }

    renderEffect(clip, clipTime, value, frame) {
        const targetChannels = this.resolveTargetChannels(clip);

        if (targetChannels.length === 0) return;

        if (clip.effectType === 'flash') {
            this.applyToChannels(targetChannels, value, frame);
        } else if (clip.effectType === 'strobe' || clip.effectType === 'pulse') {
            const freq = clip.speed || 5;
            const isOn = Math.floor(clipTime / 1000 * 2 * freq) % 2 === 0;
            this.applyToChannels(targetChannels, isOn ? value : 0, frame);
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
    renderPatternForPosition(clip, clipTime, intensity, frame, row, col, gridSize, layer) {
        if (!clip.assetId || !this.project?.assets[clip.assetId]) return;

        const asset = this.project.assets[clip.assetId];
        const frameDuration = clip.timingMode === 'beat'
            ? (60000 / (clip.bpm || 120)) * (clip.beatsPerFrame || 1)
            : (clip.frameDuration || 100);

        const assetFrameCount = asset.frames.length;
        const rawFrameIndex = Math.floor(clipTime / frameDuration);
        const frameIndex = (rawFrameIndex < 0) ? 0 : (rawFrameIndex % assetFrameCount);
        const imageData = asset.frames[frameIndex];

        // Map grid position to image coordinates (Scale pattern to fit grid if needed)
        // If single car, GS is 1x1, so we take the center of the image
        let imgRow, imgCol;
        if (gridSize.rows > 1 || gridSize.cols > 1) {
            imgRow = Math.floor((row / gridSize.rows) * imageData.height);
            imgCol = Math.floor((col / gridSize.cols) * imageData.width);
        } else {
            imgRow = Math.floor(imageData.height / 2);
            imgCol = Math.floor(imageData.width / 2);
        }

        // Clamp to image bounds
        imgRow = Math.max(0, Math.min(imgRow, imageData.height - 1));
        imgCol = Math.max(0, Math.min(imgCol, imageData.width - 1));

        const pixIdx = (imgRow * imageData.width + imgCol) * 4;
        const r = imageData.data[pixIdx];
        const g = imageData.data[pixIdx + 1];
        const b = imageData.data[pixIdx + 2];
        const a = imageData.data[pixIdx + 3];

        if (layer && layer.lightMapping && this.project.lightGroups) {
            const mapping = layer.lightMapping;
            const groups = this.project.lightGroups;

            const getGroupChs = (mappingKey) => {
                const groupName = mapping[mappingKey];
                if (!groupName) return [];

                const group = groups[groupName];
                if (!group) return [];
                return Array.isArray(group) ? group : (group.channels || []);
            };

            const chsR = getGroupChs('R');
            const chsG = getGroupChs('G');
            const chsB = getGroupChs('B');

            const mult = (a / 255) * intensity;
            this.applyToChannels(chsR, Math.floor(r * mult), frame);
            this.applyToChannels(chsG, Math.floor(g * mult), frame);
            this.applyToChannels(chsB, Math.floor(b * mult), frame);
        } else {
            // Legacy fallthrough
            const luminance = (0.299 * r + 0.587 * g + 0.114 * b) * (a / 255);
            const val = Math.floor(luminance * intensity);
            const targets = this.resolveTargetChannels(clip);
            this.applyToChannels(targets, val, frame);
        }
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
