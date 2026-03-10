import React, { useState } from 'react';
import { Upload, Download, ClipboardPaste, X, Settings } from 'lucide-react';
import ClipEditor from './ClipEditor';

export function TrackProperties({ layer, lightGroups, clipboard, onUpdate, assets, carGroups, allCarsThumbnail }) {
    const [selectedNote, setSelectedNote] = useState(null);
    const [selectedNoteIndex, setSelectedNoteIndex] = useState(0);

    const playNote = (midiNumber, durationMs = 200) => {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();

            // MIDI to Frequency: 440 * 2^((d-69)/12)
            const frequency = 440 * Math.pow(2, (midiNumber - 69) / 12);
            osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);

            // Simple synth envelope
            gain.gain.setValueAtTime(0, audioCtx.currentTime);
            gain.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.05);
            gain.gain.setValueAtTime(0.5, audioCtx.currentTime + (durationMs / 1000) - 0.05);
            gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + (durationMs / 1000));

            osc.connect(gain);
            gain.connect(audioCtx.destination);

            osc.start();
            osc.stop(audioCtx.currentTime + (durationMs / 1000));

            // Cleanup context after play
            setTimeout(() => {
                if (audioCtx.state !== 'closed') {
                    audioCtx.close();
                }
            }, durationMs + 100);
        } catch (e) {
            console.warn("AudioContext playback failed", e);
        }
    };

    if (!layer) return null;

    return (
        <div className="track-properties" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className="form-group mb-6">
                <label>Track Name</label>
                <input
                    type="text"
                    value={layer.name}
                    onChange={(e) => onUpdate({ ...layer, name: e.target.value })}
                    placeholder="Enter track name..."
                />
            </div>

            {layer.isMidi && layer.midiData && (() => {
                const handleExportMidiMapping = () => {
                    const exportData = {
                        mappings: layer.midiMappings || {},
                        comments: layer.midiComments || {}
                    };
                    const dataStr = JSON.stringify(exportData, null, 2);
                    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
                    const exportFileDefaultName = `${layer.name || 'Midi_Track'}_Mapping.json`;
                    const linkElement = document.createElement('a');
                    linkElement.setAttribute('href', dataUri);
                    linkElement.setAttribute('download', exportFileDefaultName);
                    linkElement.click();
                };

                const handleImportMidiMapping = () => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.json';
                    input.onchange = (e) => {
                        const file = e.target.files[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.readAsText(file, 'UTF-8');
                        reader.onload = (readerEvent) => {
                            try {
                                const content = JSON.parse(readerEvent.target.result);
                                onUpdate({
                                    ...layer,
                                    midiMappings: content.mappings || content, // Try to support older direct mapping exports if any
                                    midiComments: content.comments || {}
                                });
                            } catch (err) {
                                alert('Invalid JSON file');
                            }
                        };
                        e.target.value = ''; // Reset
                    };
                    input.click();
                };

                return (
                    <div className="midi-mapping-section" style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h4>Midi Note Mapping</h4>
                                <p className="section-desc">Assign copied FX clips to specific MIDI notes, then tweak them on the right.</p>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button className="btn-link-small" onClick={handleImportMidiMapping} title="Import Mapping" style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px' }}>
                                    <Upload size={14} /> Import
                                </button>
                                <button className="btn-link-small" onClick={handleExportMidiMapping} title="Export Mapping" style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px' }}>
                                    <Download size={14} /> Export
                                </button>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '20px', alignItems: 'stretch', marginTop: '12px', flex: 1, minHeight: 0 }}>
                            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '10px' }} className="custom-scrollbar">
                                {(() => {
                                    const uniqueNotes = [...new Set(layer.midiData.map(n => n.midi))].sort((a, b) => a - b);

                                    // Calculate maximum time in track for timeline scale
                                    let maxEndTime = 1000; // minimum 1 sec scale
                                    layer.midiData.forEach(n => {
                                        const end = n.time + n.duration;
                                        if (end > maxEndTime) maxEndTime = end;
                                    });

                                    return uniqueNotes.map(noteNumber => {
                                        const noteName = layer.midiData.find(n => n.midi === noteNumber)?.name || `Note ${noteNumber}`;
                                        const noteOccurrences = layer.midiData.filter(n => n.midi === noteNumber);
                                        const isMapped = !!layer.midiMappings?.[noteNumber];
                                        const isSelected = selectedNote === noteNumber;
                                        return (
                                            <div key={noteNumber}
                                                onClick={() => setSelectedNote(noteNumber)}
                                                className={`midi-note-row ${isSelected ? 'selected' : ''}`}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px',
                                                    background: isSelected ? 'rgba(160, 32, 240, 0.2)' : 'transparent',
                                                    border: isSelected ? '1px solid rgba(160, 32, 240, 0.4)' : '1px solid transparent',
                                                    padding: '0px 4px',
                                                    transition: 'all 0.2s',
                                                    cursor: 'pointer'
                                                }}>
                                                <div style={{ width: '70px', color: isSelected ? '#fff' : '#ccc', fontSize: '12px', fontWeight: isSelected ? 'bold' : 'normal' }} title={noteName}>
                                                    {noteNumber} ({noteName.split('-')[0]})
                                                </div>
                                                <input
                                                    type="text"
                                                    placeholder="Comment..."
                                                    onClick={(e) => e.stopPropagation()}
                                                    value={layer.midiComments?.[noteNumber] || ''}
                                                    onChange={(e) => {
                                                        onUpdate({
                                                            ...layer,
                                                            midiComments: {
                                                                ...(layer.midiComments || {}),
                                                                [noteNumber]: e.target.value
                                                            }
                                                        });
                                                    }}
                                                    style={{ flex: 1, maxWidth: '100px', background: 'rgba(0,0,0,0.2)', border: '1px solid #444', color: '#fff', fontSize: '12px', padding: '4px 4px', outline: 'none' }}
                                                    title="Add comment for this note"
                                                />
                                                <div style={{ flex: 1, minWidth: '200px', display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                                                    {isMapped && (() => {
                                                        const mappingData = layer.midiMappings[noteNumber];
                                                        const mappedArray = Array.isArray(mappingData) ? mappingData : [mappingData];
                                                        return mappedArray.map((fxItem, idx) => (
                                                            <button
                                                                key={idx}
                                                                title={`Select Variation ${idx + 1}`}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setSelectedNote(noteNumber);
                                                                    setSelectedNoteIndex(idx);
                                                                }}
                                                                className={`btn-link-small`}
                                                                style={{
                                                                    padding: '4px 8px', fontSize: '11px',
                                                                    background: (isSelected && selectedNoteIndex === idx) ? '#a020f0' : 'rgba(255,255,255,0.1)',
                                                                    color: (isSelected && selectedNoteIndex === idx) ? '#fff' : '#ccc',
                                                                    border: (isSelected && selectedNoteIndex === idx) ? '1px solid #d884ff' : '1px solid #444'
                                                                }}
                                                            >
                                                                {fxItem.type === 'effect' ? (fxItem.effectType || 'FX') : 'GIF'}
                                                            </button>
                                                        ));
                                                    })()}
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (clipboard && clipboard.length > 0) {
                                                                const newFxDatas = clipboard.map(clip => {
                                                                    // eslint-disable-next-line no-unused-vars
                                                                    const { id, startTime, duration, ...fxData } = clip;
                                                                    return fxData;
                                                                });

                                                                const existing = layer.midiMappings[noteNumber];
                                                                const currentArr = Array.isArray(existing) ? existing : (existing ? [existing] : []);

                                                                onUpdate({
                                                                    ...layer,
                                                                    midiMappings: {
                                                                        ...layer.midiMappings,
                                                                        [noteNumber]: [...currentArr, ...newFxDatas]
                                                                    }
                                                                });
                                                                setSelectedNote(noteNumber);
                                                                setSelectedNoteIndex(currentArr.length); // Select the first pasted one
                                                            } else {
                                                                alert('Clipboard is empty! Copy an FX first.');
                                                            }
                                                        }}
                                                        className="btn-icon"
                                                        style={{ padding: '4px', color: '#ccc', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}
                                                        title="Paste copied clip(s) as new variation"
                                                    >
                                                        <ClipboardPaste size={14} />
                                                    </button>
                                                    {isMapped && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (window.confirm(`Clear all mappings for note ${noteNumber}?`)) {
                                                                    const newMappings = { ...layer.midiMappings };
                                                                    delete newMappings[noteNumber];
                                                                    onUpdate({
                                                                        ...layer,
                                                                        midiMappings: newMappings
                                                                    });
                                                                    if (selectedNote === noteNumber) {
                                                                        setSelectedNote(null);
                                                                        setSelectedNoteIndex(0);
                                                                    }
                                                                }
                                                            }}
                                                            className="btn-icon"
                                                            style={{ padding: '4px', color: '#ef4444', background: 'rgba(239,68,68,0.1)', borderRadius: '4px', marginLeft: 'auto' }}
                                                            title="Clear all mappings for this note"
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    )}
                                                </div>

                                                {/* Mini Timeline Preview */}
                                                <div style={{
                                                    flex: 2,
                                                    minWidth: '200px',
                                                    height: '24px',
                                                    background: 'rgba(0,0,0,0.3)',
                                                    border: '1px solid #333',
                                                    borderRadius: '4px',
                                                    position: 'relative',
                                                    overflow: 'hidden'
                                                }}>
                                                    {noteOccurrences.map((occ, oIdx) => {
                                                        const leftPct = (occ.time / maxEndTime) * 100;
                                                        const widthPct = Math.max(0.5, (occ.duration / maxEndTime) * 100);
                                                        return (
                                                            <div
                                                                key={`prev-${noteNumber}-${oIdx}`}
                                                                onMouseDown={(e) => {
                                                                    e.stopPropagation();
                                                                    playNote(noteNumber, Math.min(1000, occ.duration || 200));
                                                                }}
                                                                style={{
                                                                    position: 'absolute',
                                                                    left: `${leftPct}%`,
                                                                    width: `${widthPct}%`,
                                                                    height: '100%',
                                                                    background: isMapped ? '#a020f0' : '#4a90e2',
                                                                    opacity: 0.8,
                                                                    borderRadius: '2px',
                                                                    cursor: 'pointer',
                                                                    border: '1px solid rgba(255,255,255,0.2)'
                                                                }}
                                                                title={`Play ${noteName} (${(occ.duration / 1000).toFixed(2)}s)`}
                                                                onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                                                                onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
                                                            />
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    });
                                })()}
                            </div>

                            {/* Editor Side Panel */}
                            <div style={{
                                width: '340px',
                                minWidth: '340px',
                                overflowY: 'auto',
                                background: '#151515',
                                borderRadius: '8px',
                                border: '1px solid #333',
                            }} className="custom-scrollbar">
                                {selectedNote ? (
                                    layer.midiMappings?.[selectedNote] ? (
                                        <div style={{ padding: '10px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333', paddingBottom: '10px', marginBottom: '10px' }}>
                                                <h4 style={{ margin: 0, color: '#a020f0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <Settings size={16} />
                                                    Editing Note {selectedNote}
                                                </h4>
                                            </div>
                                            {(() => {
                                                const mappingData = layer.midiMappings[selectedNote];
                                                const mappedArray = Array.isArray(mappingData) ? mappingData : [mappingData];

                                                // Ensure index is valid
                                                const activeIdx = Math.min(selectedNoteIndex, mappedArray.length - 1);
                                                if (activeIdx < 0) return null; // Shouldn't happen if mappedArray exists
                                                const fxItem = mappedArray[activeIdx];

                                                return (
                                                    <div style={{ marginBottom: '20px', padding: '10px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', border: '1px solid #444' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                                            <span style={{ fontSize: '13px', color: '#a020f0', fontWeight: 'bold' }}>Variation {activeIdx + 1} of {mappedArray.length}</span>
                                                            <button
                                                                onClick={() => {
                                                                    const currentArr = Array.isArray(layer.midiMappings[selectedNote]) ? layer.midiMappings[selectedNote] : [layer.midiMappings[selectedNote]];
                                                                    const newArr = currentArr.filter((_, i) => i !== activeIdx);

                                                                    const newMappings = { ...layer.midiMappings };
                                                                    if (newArr.length > 0) {
                                                                        newMappings[selectedNote] = newArr;
                                                                        setSelectedNoteIndex(0);
                                                                    } else {
                                                                        delete newMappings[selectedNote];
                                                                        setSelectedNote(null);
                                                                        setSelectedNoteIndex(0);
                                                                    }

                                                                    onUpdate({
                                                                        ...layer,
                                                                        midiMappings: newMappings
                                                                    });
                                                                }}
                                                                className="btn-icon"
                                                                title="Delete this FX variation"
                                                                style={{ color: '#ef4444', padding: '4px' }}
                                                            >
                                                                <X size={14} />
                                                            </button>
                                                        </div>
                                                        <ClipEditor
                                                            clips={[{
                                                                ...fxItem,
                                                                id: `midi-${selectedNote}-${activeIdx}`,
                                                                type: fxItem.type || 'effect'
                                                            }]}
                                                            onChange={(updatedData) => {
                                                                // eslint-disable-next-line no-unused-vars
                                                                const { id, startTime, duration, ...updatedFxData } = updatedData;
                                                                const currentArr = Array.isArray(layer.midiMappings[selectedNote]) ? layer.midiMappings[selectedNote] : [layer.midiMappings[selectedNote]];
                                                                const newArr = [...currentArr];
                                                                newArr[activeIdx] = updatedFxData;

                                                                onUpdate({
                                                                    ...layer,
                                                                    midiMappings: {
                                                                        ...layer.midiMappings,
                                                                        [selectedNote]: newArr
                                                                    }
                                                                });
                                                            }}
                                                            onDelete={() => { }} // Disabled the delete call inside clipEditor to use our custom header button
                                                            assets={assets}
                                                            lightGroups={lightGroups}
                                                            carGroups={carGroups}
                                                            allCarsThumbnail={allCarsThumbnail}
                                                        />
                                                    </div>
                                                );
                                            })()}
                                            {/* Hide timing fields in clip editor as they are overridden by Midi notes */}
                                            <style>{`
                                            .midi-mapping-section .custom-number-input-container:has(label:contains("Start Time")),
                                            .midi-mapping-section .custom-number-input-container:has(label:contains("Duration")) {
                                                opacity: 0.5;
                                                pointer-events: none;
                                            }
                                            .midi-mapping-section .header { display: none; /* hide clip editor default header */ }
                                            `}</style>
                                        </div>
                                    ) : (
                                        <div style={{ padding: '20px', textAlign: 'center', color: '#666', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                                            Note {selectedNote} is not mapped. Paste an FX first to edit properties.
                                        </div>
                                    )
                                ) : (
                                    <div style={{ padding: '40px 20px', textAlign: 'center', color: '#888', fontSize: '14px', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                        <div style={{ margin: '0 auto 12px auto' }}>
                                            <Settings size={32} opacity={0.3} style={{ display: 'block', margin: '0 auto' }} />
                                        </div>
                                        Select a Note row to view or edit its FX properties
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })()}
            <style>{`
                .track-properties { color: white; }
                .form-group { display: flex; flex-direction: column; gap: 8px; }
                .form-group label { font-size: 13px; color: #888; font-weight: 500; }
                .form-group input {
                    background: #2a2a2a;
                    border: 1px solid #333;
                    border-radius: 6px;
                    padding: 10px 14px;
                    color: white;
                    font-size: 15px;
                    outline: none;
                }
                .form-group input:focus { border-color: #e82020; }
                .mapping-section h4 { margin: 0 0 4px 0; font-size: 16px; color: white; }
                .section-desc { font-size: 12px; color: #666; margin: 0 0 16px 0; }
                .mapping-grid { display: flex; flex-direction: column; gap: 10px; }
                .mapping-item {
                    background: #252525;
                    border: 1px solid #333;
                    border-radius: 8px;
                    padding: 12px 16px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                .mapping-label { display: flex; align-items: center; gap: 10px; }
                .channel-indicator { width: 10px; height: 10px; border-radius: 50%; }
                .mapping-label span { font-size: 14px; font-weight: 500; }
                .mapping-select-wrapper select {
                    background: #1a1a1a;
                    color: white;
                    border: 1px solid #444;
                    padding: 6px 12px;
                    border-radius: 6px;
                    font-size: 13px;
                    outline: none;
                }
                .mapping-select-wrapper select:focus { border-color: #e82020; }
            `}</style>
        </div>
    );
}
