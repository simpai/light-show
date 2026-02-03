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
    // Add more indices to fill 48
};

// Fill remaining channels if not explicitly named
for (let i = 0; i < 48; i++) {
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
        if (!this.project) return new Uint8Array(48).fill(0);

        // Initialize frame with zeros
        const frameData = new Uint8Array(48).fill(0);

        // Iterate over layers (bottom to top)
        for (const layer of this.project.layers) {
            if (layer.muted) continue;

            const layerFrame = this.renderLayer(layer, timeMs);

            // Mix layer into main frame (Simple Max blending for now)
            for (let i = 0; i < 48; i++) {
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
                    grid[r][c] = new Uint8Array(48).fill(0);
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
        if (!this.project) return new Uint8Array(48).fill(0);

        const frameData = new Uint8Array(48).fill(0);

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

                const adjustedTime = timeMs + timeOffset;
                const clipTime = adjustedTime - clip.startTime;

                // Only render if within clip duration
                if (clipTime >= 0 && clipTime < clip.duration) {
                    const cellFrame = new Uint8Array(48).fill(0);
                    this.renderClip(clip, clipTime, cellFrame, row, col, gridSize, layer);

                    // Mix into frame
                    for (let i = 0; i < 48; i++) {
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
        const frame = new Uint8Array(48).fill(0);

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
        // Linear fade in/out calc (deprecated/legacy logic if used in other ways)
        let intensity = 1.0;

        // Ramping logic for EffectClips
        if (clip.type === 'effect' && clip.rampingEnabled) {
            const rampOnDur = (clip.rampOnEnabled !== false) ? (clip.rampOnDuration || 0) : 0;
            const rampOffDur = (clip.rampOffEnabled !== false) ? (clip.rampOffDuration || 0) : 0;

            if (rampOnDur > 0 && clipTime < rampOnDur) {
                intensity = clipTime / rampOnDur;
            } else if (rampOffDur > 0 && clipTime > (clip.duration - rampOffDur)) {
                // If turn off ramping is requested, it should finish at the end of the clip
                // So at clip.duration, intensity should be 0.
                intensity = Math.max(0, (clip.duration - clipTime) / rampOffDur);
            } else {
                intensity = 1.0;
            }
        } else {
            // Standard fadeIn/fadeOut logic
            if (clipTime < clip.fadeIn) {
                intensity = clipTime / clip.fadeIn;
            } else if (clipTime > (clip.duration - clip.fadeOut)) {
                intensity = (clip.duration - clipTime) / clip.fadeOut;
            }
        }

        if (clip.type === 'effect') {
            this.renderEffect(clip, clipTime, intensity, frame);
        } else if (clip.type === 'gif') {
            if (row !== null && col !== null && gridSize !== null) {
                this.renderPatternForPosition(clip, clipTime, intensity, frame, row, col, gridSize, layer);
            }
        }
    }

    renderEffect(clip, clipTime, intensity, frame) {
        const val = Math.floor(255 * intensity);

        if (clip.effectType === 'flash') {
            // Simple ON
            this.applyToChannels(clip.channels, val, frame);
        } else if (clip.effectType === 'pulse') {
            // Sine wave pulse
            const freq = clip.speed || 1; // Hz
            const sine = (Math.sin(clipTime / 1000 * Math.PI * 2 * freq) + 1) / 2;
            const pulseVal = Math.floor(val * sine);
            this.applyToChannels(clip.channels, pulseVal, frame);
        } else if (clip.effectType === 'strobe') {
            const freq = clip.speed || 5;
            const isOn = Math.floor(clipTime / 1000 * 2 * freq) % 2 === 0;
            const strobeVal = isOn ? val : 0;
            this.applyToChannels(clip.channels, strobeVal, frame);
        }
    }

    /**
     * Render pattern for a specific grid position
     */
    renderPatternForPosition(clip, clipTime, intensity, frame, row, col, gridSize, layer) {
        if (!clip.assetId || !this.project.assets[clip.assetId]) {
            return;
        }

        const asset = this.project.assets[clip.assetId];

        // Calculate frame duration based on timing mode
        const timingMode = clip.timingMode || 'frame';
        let frameDuration;

        if (timingMode === 'beat') {
            const bpm = clip.bpm || 120;
            const beatsPerFrame = clip.beatsPerFrame || 1;
            const msPerBeat = 60000 / bpm;
            frameDuration = msPerBeat * beatsPerFrame;
        } else {
            frameDuration = clip.frameDuration || 100;
        }

        const repetitions = clip.repetitions || 1;
        const assetFrameCount = asset.frames.length;
        const totalFrames = assetFrameCount * repetitions;
        const rawFrameIndex = Math.floor(clipTime / frameDuration);

        // Clamp to total frames
        const clampedFrameIndex = Math.min(rawFrameIndex, totalFrames - 1);
        const frameIndex = clampedFrameIndex % assetFrameCount;
        const imageData = asset.frames[frameIndex];

        // Check if grid position is within image bounds
        if (row >= imageData.height || col >= imageData.width) {
            return; // Out of bounds
        }

        const pixelIndex = (row * imageData.width + col) * 4; // RGBA
        const r = imageData.data[pixelIndex];
        const g = imageData.data[pixelIndex + 1];
        const b = imageData.data[pixelIndex + 2];
        const a = imageData.data[pixelIndex + 3];

        // Use track mapping if available
        if (layer && layer.lightMapping && this.project.lightGroups) {
            const mapping = layer.lightMapping;
            const groups = this.project.lightGroups;

            const channelsR = groups[mapping.R]?.channels || [];
            const channelsG = groups[mapping.G]?.channels || [];
            const channelsB = groups[mapping.B]?.channels || [];

            const valR = Math.floor(r * (a / 255) * intensity);
            const valG = Math.floor(g * (a / 255) * intensity);
            const valB = Math.floor(b * (a / 255) * intensity);

            this.applyToChannels(channelsR, valR, frame);
            this.applyToChannels(channelsG, valG, frame);
            this.applyToChannels(channelsB, valB, frame);
        } else {
            // Fallback to legacy channel-based logic
            const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
            let brightness = Math.floor(luminance * (a / 255));

            const mode = clip.brightnessMode || 'gradient';
            if (mode === 'binary') {
                const threshold = clip.brightnessThreshold || 128;
                brightness = brightness > threshold ? 255 : 0;
            }

            const value = Math.floor(brightness * intensity);
            this.applyToChannels(clip.channels, value, frame);
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
