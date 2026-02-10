import React from 'react';
import { Plus, ClipboardPaste, X } from 'lucide-react';

export default function ClipPalette({
    palette,
    onPaletteChange,
    clipboard,
    onClipSelect,
    selectedClipId,
    assets
}) {
    const handlePasteToSlot = (slotIndex) => {
        if (!clipboard || !Array.isArray(clipboard)) return;

        const newPalette = [...palette];
        // Deep copy of clipboard clips with new IDs
        newPalette[slotIndex].clips = clipboard.map(clip => ({
            ...clip,
            id: crypto.randomUUID(),
            // Relative timing within palette slot should be normalized?
            // Actually, keep relative timing but let's see how they paste.
        }));
        onPaletteChange(newPalette);
    };

    const handleAddSlot = () => {
        const nextShortcut = palette.length < 10 ? "" : ""; // No default for new ones
        onPaletteChange([...palette, {
            id: crypto.randomUUID(),
            shortcut: "",
            clips: []
        }]);
    };

    const handleRemoveSlot = (index) => {
        const newPalette = palette.filter((_, i) => i !== index);
        onPaletteChange(newPalette);
    };

    const handleShortcutChange = (index, value) => {
        const newPalette = [...palette];
        newPalette[index].shortcut = value.toLowerCase();
        onPaletteChange(newPalette);
    };

    return (
        <div className="clip-palette">
            <div className="palette-header">
                <label className="section-title">Clip Palette</label>
                <button className="add-slot-btn" onClick={handleAddSlot} title="Add Slot">
                    <Plus size={16} />
                </button>
            </div>

            <div className="palette-slots">
                {palette.map((slot, index) => (
                    <div key={slot.id} className="palette-slot">
                        <div className="slot-toolbar">
                            <input
                                className="shortcut-input"
                                value={slot.shortcut}
                                onChange={(e) => handleShortcutChange(index, e.target.value)}
                                maxLength={1}
                                title="Shortcut Key"
                            />
                            <input
                                className="note-input"
                                value={slot.note || ""}
                                onChange={(e) => {
                                    const newPalette = [...palette];
                                    newPalette[index].note = e.target.value;
                                    onPaletteChange(newPalette);
                                }}
                                placeholder="Note..."
                                title="Slot Comment"
                            />
                            <button
                                className="slot-paste-btn"
                                onClick={() => handlePasteToSlot(index)}
                                disabled={!clipboard}
                                title="Set from Clipboard"
                            >
                                <ClipboardPaste size={14} />
                            </button>
                            <button
                                className="slot-clear-btn"
                                onClick={() => {
                                    const newPalette = [...palette];
                                    newPalette[index].clips = [];
                                    onPaletteChange(newPalette);
                                }}
                                title="Clear Slot"
                            >
                                <X size={14} />
                            </button>
                        </div>

                        <div className="slot-clips-preview">
                            {slot.clips.length === 0 ? (
                                <div className="empty-preview">Empty</div>
                            ) : (
                                <div className="clips-visualizer">
                                    {slot.clips.map(clip => (
                                        <div
                                            key={clip.id}
                                            className={`palette-clip-item ${clip.type} ${selectedClipId === clip.id ? 'selected' : ''}`}
                                            onClick={() => onClipSelect(clip.id)}
                                            title={`${clip.type}: ${clip.id}`}
                                        >
                                            <div className="clip-icon-placeholder">
                                                {clip.type === 'gif' ? 'GIF' : 'FX'}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <style>{`
                .clip-palette {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    background: #1a1a1a;
                    border-right: 1px solid #333;
                    width: 100%;
                    overflow: hidden;
                }

                .palette-header {
                    padding: 12px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 1px solid #333;
                    background: #222;
                }

                .palette-slots {
                    flex: 1;
                    overflow-y: auto;
                    padding: 10px;
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                .palette-slots::-webkit-scrollbar {
                    width: 6px;
                }
                .palette-slots::-webkit-scrollbar-track {
                    background: transparent;
                }
                .palette-slots::-webkit-scrollbar-thumb {
                    background: #333;
                    border-radius: 3px;
                }
                .palette-slots::-webkit-scrollbar-thumb:hover {
                    background: #444;
                }

                .palette-slot {
                    background: #252525;
                    border: 1px solid #444;
                    border-radius: 8px;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    flex-shrink: 0;
                    min-height: 80px;
                }

                .slot-toolbar {
                    display: flex;
                    align-items: center;
                    padding: 6px;
                    background: #2a2a2a;
                    gap: 6px;
                    border-bottom: 1px solid #333;
                }

                .shortcut-input {
                    width: 22px;
                    height: 28px;
                    background: #111;
                    border: 1px solid #e82020;
                    color: #fff;
                    text-align: center;
                    border-radius: 4px 0 0 4px;
                    font-size: 13px;
                    font-weight: bold;
                    text-transform: uppercase;
                    flex-shrink: 0;
                    margin-right: -6px;
                    z-index: 1;
                }

                .slot-paste-btn {
                    width: 28px;
                    height: 28px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: #333;
                    border: 1px solid #444;
                    color: #ccc;
                    border-radius: 4px;
                    cursor: pointer;
                    transition: all 0.2s;
                    flex-shrink: 0;
                }

                .note-input {
                    flex: 1;
                    height: 28px;
                    background: #111;
                    border: 1px solid #333;
                    color: #eee;
                    padding: 0 8px;
                    font-size: 11px;
                    border-radius: 0 4px 4px 0;
                    min-width: 0;
                }
                .note-input:focus {
                    border-color: #555;
                    outline: none;
                }

                .slot-paste-btn:hover:not(:disabled) {
                    background: #444;
                    color: white;
                    border-color: #555;
                }

                .slot-paste-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                .slot-clear-btn {
                    width: 28px;
                    height: 28px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: transparent;
                    border: 1px solid transparent;
                    color: #666;
                    cursor: pointer;
                    border-radius: 4px;
                    flex-shrink: 0;
                }

                .slot-clear-btn:hover {
                    color: #ff4d4d;
                    background: rgba(255, 77, 77, 0.1);
                }

                .slot-clips-preview {
                    min-height: 50px;
                    padding: 8px;
                    background: #111;
                }

                .empty-preview {
                    height: 34px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #444;
                    font-size: 12px;
                    font-style: italic;
                    border: 1px dashed #333;
                    border-radius: 4px;
                }

                .clips-visualizer {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 4px;
                }

                .palette-clip-item {
                    width: 40px;
                    height: 34px;
                    background: #333;
                    border: 1px solid #444;
                    border-radius: 4px;
                    overflow: hidden;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                    position: relative;
                }

                .palette-clip-item.gif { border-left: 3px solid #4a90e2; }
                .palette-clip-item.effect { border-left: 3px solid #e82020; }

                .palette-clip-item:hover {
                    border-color: #666;
                    transform: translateY(-1px);
                    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                }

                .palette-clip-item.selected {
                    border-color: #e82020;
                    background: rgba(232, 32, 32, 0.1);
                    box-shadow: 0 0 0 1px #e82020;
                }

                .palette-clip-item img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }

                .clip-icon-placeholder {
                    font-size: 8px;
                    font-weight: bold;
                    color: #888;
                }

                .add-slot-btn {
                    padding: 4px;
                    background: transparent;
                    border: 1px solid #444;
                    color: #aaa;
                    border-radius: 4px;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .add-slot-btn:hover {
                    background: #333;
                    color: white;
                    border-color: #666;
                }

                .section-title {
                    font-size: 13px;
                    font-weight: bold;
                    color: #eee;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
            `}</style>
        </div>
    );
}
