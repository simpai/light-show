import { v4 as uuidv4 } from 'uuid';

export class ProjectState {
    constructor() {
        this.layers = [
            {
                id: 'layer-1',
                name: 'Main Track',
                muted: false,
                clips: [],
                lightMapping: {
                    R: 'Red',
                    G: 'MainWhite',
                    B: 'Yellow'
                },
                isMidi: false,
                midiData: null,
                midiMappings: {}
            }
        ];
        this.assets = {}; // Store blob URLs or Image objects for GIFs
        this.duration = 0;
        this.analysis = { beat_times: [], onset_times: [], reference_beats: [], bpm: 120, offset: 0 };
        this.lightGroups = {
            'Red': { channels: [24, 25, 26], color: '#ff0000' }, // Brake, Tail, Tail
            'MainWhite': { channels: [0, 1, 2, 3], color: '#ffffff' }, // Front Outer/Inner Main Beam
            'Yellow': { channels: [12, 13, 20, 21, 22, 23], color: '#ffbb00' } // Front Turn and Side Repeaters
        };
        this.carGroups = []; // Array of { id, name, selection: string[], thumbnail: string }
        this.jitter = 0; // ms
        this.waveform = null; // { peaks: number[], pointsPerSecond: number }
        this.palette = this.createDefaultPalette();
    }

    createDefaultPalette() {
        const shortcuts = ['1', '2', '3', '4', '5', 'q', 'w', 'e', 'r', 't'];
        return shortcuts.map((key, i) => ({
            id: uuidv4(),
            shortcut: key,
            note: "",
            randomToggle: false,
            sequentialToggle: false,
            sequentialIndex: 0,
            clips: []
        }));
    }

    addLayer(name = 'New Layer') {
        this.layers.push({
            id: uuidv4(),
            name,
            muted: false,
            clips: [],
            lightMapping: {
                R: 'Red',
                G: 'MainWhite',
                B: 'Yellow'
            },
            isMidi: false,
            midiData: null,
            midiMappings: {}
        });
    }

    addMidiLayer(name = 'Midi Track', midiData = []) {
        let maxTime = 1000;
        if (midiData && midiData.length > 0) {
            maxTime = Math.max(...midiData.map(n => n.time + n.duration));
        }

        this.layers.push({
            id: uuidv4(),
            name,
            muted: false,
            clips: [{
                id: `midi-region-${Date.now()}`,
                type: 'midi-region',
                startTime: 0,
                startOffset: 0,
                duration: maxTime
            }],
            lightMapping: {
                R: 'Red',
                G: 'MainWhite',
                B: 'Yellow'
            },
            isMidi: true,
            midiData: midiData,
            midiMappings: {},
            midiComments: {}
        });
    }

    addClip(layerId, clipConf) {
        const layer = this.layers.find(l => l.id === layerId);
        if (layer) {
            const newClip = {
                id: uuidv4(),
                startTime: clipConf.startTime || 0,
                duration: clipConf.duration || 1000,
                type: clipConf.type || 'effect', // 'effect' | 'gif'
                effectType: clipConf.effectType || 'flash',
                channels: clipConf.channels || [],
                targetLightGroups: clipConf.targetLightGroups || [],
                fadeIn: 0,
                fadeOut: 0,
                // Position-based pattern properties
                pattern: clipConf.pattern || 'uniform',
                patternDirection: clipConf.patternDirection || 'horizontal',
                patternSpeed: clipConf.patternSpeed || 1.0,
                // Image pattern properties
                assetId: clipConf.assetId || null,
                fps: clipConf.fps || 12,
                brightnessMode: clipConf.brightnessMode || 'gradient',
                brightnessThreshold: clipConf.brightnessThreshold || 128,
                rampingEnabled: clipConf.rampingEnabled || false,
                rampOnEnabled: clipConf.rampOnEnabled !== undefined ? clipConf.rampOnEnabled : true,
                rampOffEnabled: clipConf.rampOffEnabled !== undefined ? clipConf.rampOffEnabled : true,
                rampOnDuration: clipConf.rampOnDuration || 500,
                rampOffDuration: clipConf.rampOffDuration || 500,
                patternDensity: clipConf.patternDensity !== undefined ? clipConf.patternDensity : 0.5,
                patternInterval: clipConf.patternInterval !== undefined ? clipConf.patternInterval : 100,
                // Eq properties
                bandCount: clipConf.bandCount || 1,
                bands: clipConf.bands || [{ minFreq: 20, maxFreq: 20000, maxScale: 1.0, minCutoff: 0, imageId: null }],
                peakHold: clipConf.peakHold || false,
                decay: clipConf.decay !== undefined ? clipConf.decay : 0.1,
                ...clipConf
            };
            layer.clips.push(newClip);
            return newClip;
        }
        return null;
    }

    loadAnalysis(analysisData) {
        this.analysis = analysisData;
        this.duration = analysisData.duration * 1000;
    }

    /**
     * Serialize project to JSON-compatible object
     */
    toJSON(includeAssets = true) {
        let safeWaveform = this.waveform;
        if (safeWaveform) {
            safeWaveform = { ...this.waveform };
            delete safeWaveform.spectrogram; // Remove huge array to prevent JSON stringify error
        }

        return {
            layers: this.layers,
            assets: includeAssets ? this.serializeAssets() : {},
            duration: this.duration,
            analysis: this.analysis,
            lightGroups: this.lightGroups,
            carGroups: this.carGroups,
            jitter: this.jitter,
            waveform: safeWaveform,
            palette: this.palette
        };
    }

    /**
     * Convert ImageData assets to base64
     */
    serializeAssets() {
        const serialized = {};
        for (const [id, asset] of Object.entries(this.assets)) {
            serialized[id] = {
                width: asset.width,
                height: asset.height,
                fps: asset.fps,
                frames: asset.frames.map(imageData => {
                    const canvas = document.createElement('canvas');
                    canvas.width = imageData.width;
                    canvas.height = imageData.height;
                    const ctx = canvas.getContext('2d');
                    ctx.putImageData(imageData, 0, 0);
                    return canvas.toDataURL('image/png');
                })
            };
        }
        return serialized;
    }

    /**
     * Load from JSON object (Synchronous version, skipping asset deserialization)
     */
    static fromJSONSync(data) {
        const project = new ProjectState();
        project.layers = JSON.parse(JSON.stringify(data.layers)); // Deep copy layers/clips

        // Migration: Ensure all layers have default light mapping
        project.layers.forEach(layer => {
            if (!layer.lightMapping) {
                layer.lightMapping = {
                    R: 'Red',
                    G: 'MainWhite',
                    B: 'Yellow'
                };
            }
            if (layer.isMidi === undefined) {
                layer.isMidi = false;
                layer.midiData = null;
                layer.midiMappings = {};
                layer.midiComments = {};
            } else if (layer.isMidi) {
                // Migration: old midi tracks don't have clips
                if (!layer.clips || layer.clips.length === 0) {
                    let maxTime = 1000;
                    if (layer.midiData && layer.midiData.length > 0) {
                        maxTime = Math.max(...layer.midiData.map(n => n.time + n.duration));
                    }
                    layer.clips = [{
                        id: `midi-region-${Date.now()}-${layer.id}`,
                        type: 'midi-region',
                        startTime: 0,
                        startOffset: 0,
                        duration: maxTime
                    }];
                } else {
                    layer.clips.forEach(c => {
                        if (c.type === 'midi-region' && c.startOffset === undefined) {
                            c.startOffset = 0;
                        }
                    });
                }
                if (!layer.midiComments) layer.midiComments = {};
            }
        });

        project.duration = data.duration;
        project.analysis = data.analysis;

        // Migration: Ensure lightGroups is in the new { channels, color } format
        if (data.lightGroups) {
            const migrated = {};
            Object.entries(data.lightGroups).forEach(([name, group]) => {
                if (Array.isArray(group)) {
                    // Default colors for known groups
                    let color = '#ffffff';
                    if (name === 'Red') color = '#ff0000';
                    else if (name === 'MainWhite') color = '#ffffff';
                    else if (name === 'Yellow' || name === 'B') color = '#ffff00';
                    migrated[name] = { channels: group, color };
                } else if (group && typeof group === 'object' && !group.color) {
                    // Object format but missing color
                    let color = '#ffffff';
                    if (name === 'Red') color = '#ff0000';
                    else if (name === 'MainWhite') color = '#ffffff';
                    else if (name === 'Yellow' || name === 'B') color = '#ffff00';
                    migrated[name] = { ...group, color };
                } else {
                    migrated[name] = group;
                }
            });

            // Ensure 'Yellow' group exists
            if (!migrated['Yellow']) {
                if (migrated['B']) {
                    migrated['Yellow'] = { ...migrated['B'] };
                } else {
                    migrated['Yellow'] = { channels: [12, 13, 20, 21, 22, 23], color: '#ffff00' };
                }
            }

            project.lightGroups = migrated;
        } else {
            project.lightGroups = project.lightGroups;
        }

        project.carGroups = data.carGroups || [];
        project.jitter = data.jitter || 0;
        project.waveform = data.waveform || null;
        project.palette = data.palette || project.createDefaultPalette();
        // Migration: Ensure all palette slots have a note property
        project.palette.forEach(slot => {
            if (slot.note === undefined) slot.note = "";
            if (slot.randomToggle === undefined) slot.randomToggle = false;
            if (slot.sequentialToggle === undefined) slot.sequentialToggle = false;
            if (slot.sequentialIndex === undefined) slot.sequentialIndex = 0;
        });
        return project;
    }

    /**
     * Load from JSON object
     */
    static async fromJSON(data) {
        const project = ProjectState.fromJSONSync(data);
        project.assets = await ProjectState.deserializeAssets(data.assets);
        return project;
    }

    /**
     * Convert base64 back to ImageData
     */
    static async deserializeAssets(serializedAssets) {
        const assets = {};
        for (const [id, asset] of Object.entries(serializedAssets)) {
            const frames = await Promise.all(
                asset.frames.map(base64 => {
                    return new Promise((resolve) => {
                        const img = new Image();
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            canvas.width = asset.width;
                            canvas.height = asset.height;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0);
                            resolve(ctx.getImageData(0, 0, asset.width, asset.height));
                        };
                        img.src = base64;
                    });
                })
            );
            assets[id] = {
                width: asset.width,
                height: asset.height,
                fps: asset.fps,
                frames
            };
        }
        return assets;
    }
}
