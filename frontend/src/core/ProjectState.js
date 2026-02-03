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
                }
            }
        ];
        this.assets = {}; // Store blob URLs or Image objects for GIFs
        this.duration = 0;
        this.analysis = null;
        this.lightGroups = {
            'Red': { channels: [14, 25, 26, 24], color: '#ff0000' }, // Fog (Rear), Tail, Tail, Brake
            'MainWhite': { channels: [0, 1, 2, 3], color: '#ffffff' }, // Front High/Low
            'Yellow': { channels: [8, 9, 10, 11, 12, 13], color: '#ffff00' } // Front/Rear/Side Signals
        };
        this.carGroups = []; // Array of { id, name, selection: string[], thumbnail: string }
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
            }
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
    toJSON() {
        return {
            layers: this.layers,
            assets: this.serializeAssets(),
            duration: this.duration,
            analysis: this.analysis,
            lightGroups: this.lightGroups,
            carGroups: this.carGroups
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
                    migrated['Yellow'] = { channels: [8, 9, 10, 11, 12, 13], color: '#ffff00' };
                }
            }

            project.lightGroups = migrated;
        } else {
            project.lightGroups = project.lightGroups;
        }

        project.carGroups = data.carGroups || [];
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
