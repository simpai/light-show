import React from 'react';
import { Trash2 } from 'lucide-react';

const CHANNELS = {
    "Main Beams": [0, 1],
    "Main Beams 2": [2, 3],
    "Signature": [4, 5],
    "Turn Signals": [12, 13],
    "Fog Lights": [14, 15],
    "Tail Lights": [25, 26],
    "Brake": [24],
    "Reverse": [22, 23] // Correction needed? Check mappings
};

export default function ClipEditor({ clip, onChange, onDelete }) {
    if (!clip) return <div className="p-4 text-gray-500">No clip selected</div>;

    const handleChange = (field, value) => {
        onChange({ ...clip, [field]: value });
    };

    const toggleChannel = (groupChannels) => {
        const current = new Set(clip.channels || []);
        // Check if all group channels are present
        const allPresent = groupChannels.every(c => current.has(c));

        if (allPresent) {
            // Remove all
            groupChannels.forEach(c => current.delete(c));
        } else {
            // Add all
            groupChannels.forEach(c => current.add(c));
        }
        handleChange('channels', Array.from(current));
    };

    return (
        <div className="clip-editor p-4 text-sm">
            <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-white">Edit Clip</h3>
                <button onClick={() => onDelete(clip.id)} className="text-red-500 hover:text-red-400">
                    <Trash2 size={16} />
                </button>
            </div>

            <div className="form-group mb-3">
                <label className="block mb-1 text-gray-400">Type</label>
                <select
                    value={clip.type || 'effect'}
                    onChange={e => handleChange('type', e.target.value)}
                    className="w-full bg-[#333] border border-[#444] rounded p-1 text-white"
                >
                    <option value="effect">Effect (Lights)</option>
                    <option value="pattern">Pattern (Image/GIF)</option>
                </select>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
                <div>
                    <label className="block mb-1 text-gray-400">Start (ms)</label>
                    <input
                        type="number"
                        value={clip.startTime}
                        onChange={e => handleChange('startTime', parseInt(e.target.value))}
                        className="w-full bg-[#333] border border-[#444] rounded p-1 text-white"
                    />
                </div>
                <div>
                    <label className="block mb-1 text-gray-400">Duration (ms)</label>
                    <input
                        type="number"
                        value={clip.duration}
                        onChange={e => handleChange('duration', parseInt(e.target.value))}
                        className="w-full bg-[#333] border border-[#444] rounded p-1 text-white"
                    />
                </div>
            </div>

            {clip.type === 'effect' && (
                <>
                    <div className="form-group mb-3">
                        <label className="block mb-1 text-gray-400">Effect Style</label>
                        <select
                            value={clip.effectType || 'flash'}
                            onChange={e => handleChange('effectType', e.target.value)}
                            className="w-full bg-[#333] border border-[#444] rounded p-1 text-white"
                        >
                            <option value="flash">Flash (Hold)</option>
                            <option value="pulse">Pulse (Sine)</option>
                            <option value="strobe">Strobe</option>
                        </select>
                    </div>

                    {(clip.effectType === 'pulse' || clip.effectType === 'strobe') && (
                        <div className="form-group mb-3">
                            <label className="block mb-1 text-gray-400">
                                Speed (Hz) - {clip.speed || 1} cycles/sec
                            </label>
                            <input
                                type="range"
                                min="0.5"
                                max="10"
                                step="0.5"
                                value={clip.speed || 1}
                                onChange={e => handleChange('speed', parseFloat(e.target.value))}
                                className="w-full"
                            />
                        </div>
                    )}

                    <div className="form-group mb-3">
                        <label className="block mb-1 text-gray-400">Pattern Type</label>
                        <select
                            value={clip.pattern || 'uniform'}
                            onChange={e => handleChange('pattern', e.target.value)}
                            className="w-full bg-[#333] border border-[#444] rounded p-1 text-white"
                        >
                            <option value="uniform">Uniform (All at once)</option>
                            <option value="wave">Wave</option>
                            <option value="sequential">Sequential</option>
                            <option value="radial">Radial</option>
                        </select>
                    </div>

                    {clip.pattern && clip.pattern !== 'uniform' && (
                        <>
                            <div className="form-group mb-3">
                                <label className="block mb-1 text-gray-400">Direction</label>
                                <select
                                    value={clip.patternDirection || 'horizontal'}
                                    onChange={e => handleChange('patternDirection', e.target.value)}
                                    className="w-full bg-[#333] border border-[#444] rounded p-1 text-white"
                                >
                                    {clip.pattern === 'wave' && (
                                        <>
                                            <option value="horizontal">Horizontal (Left to Right)</option>
                                            <option value="vertical">Vertical (Top to Bottom)</option>
                                            <option value="diagonal-right">Diagonal ↘</option>
                                            <option value="diagonal-left">Diagonal ↙</option>
                                        </>
                                    )}
                                    {clip.pattern === 'sequential' && (
                                        <>
                                            <option value="row-by-row">Row by Row</option>
                                            <option value="col-by-col">Column by Column</option>
                                        </>
                                    )}
                                    {clip.pattern === 'radial' && (
                                        <>
                                            <option value="outward">Outward (Center to Edge)</option>
                                            <option value="inward">Inward (Edge to Center)</option>
                                        </>
                                    )}
                                </select>
                            </div>

                            <div className="form-group mb-3">
                                <label className="block mb-1 text-gray-400">
                                    Pattern Speed - {(clip.patternSpeed || 1).toFixed(1)}x
                                </label>
                                <input
                                    type="range"
                                    min="0.1"
                                    max="5"
                                    step="0.1"
                                    value={clip.patternSpeed || 1}
                                    onChange={e => handleChange('patternSpeed', parseFloat(e.target.value))}
                                    className="w-full"
                                />
                            </div>
                        </>
                    )}

                    <div className="form-group mb-3">
                        <label className="block mb-1 text-gray-400">Target Lights</label>
                        <div className="space-y-1 max-h-40 overflow-y-auto border border-[#333] p-2 rounded">
                            {Object.entries(CHANNELS).map(([label, groupChs]) => {
                                const isChecked = groupChs.every(c => (clip.channels || []).includes(c));
                                return (
                                    <label key={label} className="flex items-center space-x-2 cursor-pointer hover:bg-[#222] p-1 rounded">
                                        <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={() => toggleChannel(groupChs)}
                                            className="form-checkbox bg-[#333] border-[#555]"
                                        />
                                        <span>{label}</span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}

            {clip.type === 'pattern' && (
                <div className="p-2 bg-[#222] rounded border border-[#333]">
                    <p className="text-yellow-500 text-xs mb-2">GIF Support Coming Soon</p>
                    <input type="file" disabled className="w-full text-xs" />
                </div>
            )}
            {clip.type === 'pattern' && (
                <div className="p-2 bg-[#222] rounded border border-[#333]">
                    <div className="form-group mb-3">
                        <label className="block mb-1 text-gray-400">Upload Image/GIF</label>
                        <input
                            type="file"
                            accept="image/gif,image/png,image/jpeg,image/jpg"
                            onChange={(e) => {
                                if (e.target.files[0] && onChange) {
                                    // Signal parent to handle upload
                                    const event = new CustomEvent('imageUpload', {
                                        detail: { clipId: clip.id, file: e.target.files[0] }
                                    });
                                    window.dispatchEvent(event);
                                }
                            }}
                            className="w-full text-xs text-white file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-[#e82020] file:text-white hover:file:bg-[#c01818]"
                        />
                        {clip.assetId && (
                            <p className="text-xs text-green-400 mt-1">✓ Image loaded</p>
                        )}
                    </div>

                    <div className="form-group mb-3">
                        <label className="block mb-1 text-gray-400">Brightness Mode</label>
                        <select
                            value={clip.brightnessMode || 'gradient'}
                            onChange={e => handleChange('brightnessMode', e.target.value)}
                            className="w-full bg-[#333] border border-[#444] rounded p-1 text-white"
                        >
                            <option value="gradient">Gradient (0-255)</option>
                            <option value="binary">Binary (ON/OFF)</option>
                        </select>
                    </div>

                    {clip.brightnessMode === 'binary' && (
                        <div className="form-group mb-3">
                            <label className="block mb-1 text-gray-400">
                                Threshold - {clip.brightnessThreshold || 128}
                            </label>
                            <input
                                type="range"
                                min="0"
                                max="255"
                                step="1"
                                value={clip.brightnessThreshold || 128}
                                onChange={e => handleChange('brightnessThreshold', parseInt(e.target.value))}
                                className="w-full"
                            />
                        </div>
                    )}

                    {clip.assetId && (
                        <div className="form-group mb-3">
                            <label className="block mb-1 text-gray-400">
                                Frame Rate - {clip.fps || 12} FPS
                            </label>
                            <input
                                type="range"
                                min="1"
                                max="30"
                                step="1"
                                value={clip.fps || 12}
                                onChange={e => handleChange('fps', parseInt(e.target.value))}
                                className="w-full"
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
