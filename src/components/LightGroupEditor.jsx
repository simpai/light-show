import React, { useState } from 'react';
import { Plus, Download, Upload, Trash2 } from 'lucide-react';

export function LightGroupEditor({ lightGroups, onUpdate }) {
    const [editingGroup, setEditingGroup] = useState(null);

    const handleAddGroup = () => {
        const name = prompt("Enter light group name:");
        if (name && !lightGroups[name]) {
            onUpdate({ ...lightGroups, [name]: { channels: [], color: '#ffffff' } });
        }
    };

    const handleDeleteGroup = (name) => {
        if (window.confirm(`Delete group "${name}"?`)) {
            const newGroups = { ...lightGroups };
            delete newGroups[name];
            onUpdate(newGroups);
        }
    };

    const toggleChannel = (groupName, channel) => {
        const group = lightGroups[groupName];
        const channels = group.channels || [];
        const newChannels = channels.includes(channel)
            ? channels.filter(c => c !== channel)
            : [...channels, channel].sort((a, b) => a - b);
        onUpdate({
            ...lightGroups,
            [groupName]: { ...group, channels: newChannels }
        });
    };


    const updateGroupColor = (name, color) => {
        onUpdate({
            ...lightGroups,
            [name]: { ...lightGroups[name], color }
        });
    };

    const handleExportLightGroups = () => {
        const dataStr = JSON.stringify(lightGroups, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
        const exportFileDefaultName = 'tesla_light_groups.json';
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
    };

    const handleImportLightGroups = () => {
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
                    onUpdate(content);
                } catch (err) {
                    alert('Invalid JSON file');
                }
            };
            e.target.value = ''; // Reset
        };
        input.click();
    };

    const CHANNEL_NAMES = {
        0: "Left Outer Main Beam",
        1: "Right Outer Main Beam",
        2: "Left Inner Main Beam",
        3: "Right Inner Main Beam",
        4: "Left Signature",
        5: "Right Signature",
        6: "Left Channel 4",
        7: "Right Channel 4",
        8: "Left Channel 5",
        9: "Right Channel 5",
        10: "Left Channel 6",
        11: "Right Channel 6",
        12: "Left Front Turn",
        13: "Right Front Turn",
        14: "Left Front Fog",
        15: "Right Front Fog",
        16: "Left Aux Park",
        17: "Right Aux Park",
        18: "Left Side Marker",
        19: "Right Side Marker",
        20: "Left Side Repeater",
        21: "Right Side Repeater",
        22: "Left Rear Turn",
        23: "Right Rear Turn",
        24: "Brake Lights",
        25: "Left Tail",
        26: "Right Tail",
        27: "Reverse Lights",
        28: "Rear Fog Lights",
        29: "License Plate Lights",
        30: "Left Falcon Door",
        31: "Right Falcon Door",
        32: "Left Front Door",
        33: "Right Front Door",
        34: "Left Mirror",
        35: "Right Mirror",
        36: "Left Front Window",
        37: "Right Front Window",
        38: "Left Rear Window",
        39: "Right Rear Window",
        40: "Liftgate",
        41: "Left Front Door Handle",
        42: "Right Front Door Handle",
        43: "Left Rear Door Handle",
        44: "Right Rear Door Handle",
        45: "Charge Port",
    };

    for (let i = 46; i < 48; i++) {
        if (!CHANNEL_NAMES[i]) CHANNEL_NAMES[i] = `Channel ${i}`;
    }

    return (
        <div className="light-group-editor">
            <div className="editor-controls mb-4" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button onClick={handleAddGroup} className="btn-tesla-sm">
                    <Plus size={18} /> Add New Group
                </button>
                <div className="header-actions" style={{ display: 'flex', gap: '8px' }}>
                    <button className="import-btn" onClick={handleImportLightGroups} title="Import Light Groups">
                        <Upload size={16} style={{ marginRight: '6px' }} /> Import
                    </button>
                    <button className="export-btn" onClick={handleExportLightGroups} title="Export Light Groups">
                        <Download size={16} style={{ marginRight: '6px' }} /> Export
                    </button>
                </div>
            </div>

            <div className="groups-list">
                {Object.entries(lightGroups).map(([name, groupData]) => {
                    const channels = groupData.channels || [];
                    const color = groupData.color || '#ffffff';

                    return (
                        <div key={name} className="group-card">
                            <div className="group-header">
                                <div className="group-info">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <input
                                            type="color"
                                            value={color}
                                            onChange={(e) => updateGroupColor(name, e.target.value)}
                                            style={{
                                                width: '24px',
                                                height: '24px',
                                                border: 'none',
                                                padding: 0,
                                                background: 'none',
                                                cursor: 'pointer'
                                            }}
                                            title="Set group color"
                                        />
                                        <span className="group-name">{name}</span>
                                    </div>
                                    <span className="channel-count">{channels.length} channels</span>
                                </div>
                                <div className="group-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <button
                                        className={`btn-secondary ${editingGroup === name ? 'active' : ''}`}
                                        onClick={() => setEditingGroup(editingGroup === name ? null : name)}
                                    >
                                        {editingGroup === name ? "Finish" : "Edit Channels"}
                                    </button>
                                    <button onClick={() => handleDeleteGroup(name)} className="btn-delete-plain">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>

                            {editingGroup === name && (
                                <div className="channels-grid-container">
                                    <div className="channels-grid">
                                        {Array.from({ length: 48 }).map((_, i) => (
                                            <button
                                                key={i}
                                                onClick={() => toggleChannel(name, i)}
                                                className={`channel-btn ${channels.includes(i) ? 'selected' : ''}`}
                                                title={CHANNEL_NAMES[i]}
                                            >
                                                <div className="ch-num">CH{i}</div>
                                                <div className="ch-name">{CHANNEL_NAMES[i] || `CH${i}`}</div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            <style>{`
                .light-group-editor { color: white; }
                .btn-tesla-sm {
                    background: #e82020;
                    color: white;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 6px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    cursor: pointer;
                    font-weight: 500;
                    transition: background 0.2s;
                }
                .btn-tesla-sm:hover { background: #c01818; }
                .light-group-editor .editor-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 16px;
                    padding-bottom: 12px;
                    border-bottom: 1px solid #333;
                }
                .light-group-editor .editor-header h3 {
                    margin: 0;
                    font-size: 18px;
                    color: white;
                }
                .light-group-editor .header-actions {
                    display: flex;
                    gap: 8px;
                }
                .light-group-editor .export-btn,
                .light-group-editor .import-btn {
                    padding: 6px 14px;
                    border-radius: 6px;
                    font-size: 13px;
                    font-weight: 500;
                    cursor: pointer;
                    background: #333;
                    color: #eee;
                    border: 1px solid #444;
                    transition: all 0.2s;
                }
                .light-group-editor .export-btn:hover,
                .light-group-editor .import-btn:hover {
                    background: #444;
                    color: white;
                    border-color: #666;
                }
                .groups-list {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    margin-top: 16px;
                }
                .group-card {
                    background: #252525;
                    border: 1px solid #333;
                    border-radius: 8px;
                    overflow: hidden;
                }
                .group-header {
                    padding: 12px 16px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: #2a2a2a;
                }
                .group-info { display: flex; flex-direction: column; gap: 2px; }
                .group-name { font-weight: 600; color: #e82020; font-size: 15px; }
                .channel-count { font-size: 11px; color: #888; }
                .group-actions { display: flex; gap: 8px; align-items: center; }
                .btn-secondary {
                    background: #333;
                    color: #ddd;
                    border: 1px solid #444;
                    padding: 5px 12px;
                    border-radius: 4px;
                    font-size: 12px;
                    cursor: pointer;
                }
                .btn-secondary:hover { background: #444; color: white; }
                .btn-secondary.active { background: #e82020; border-color: #e82020; color: white; }
                .btn-delete-plain {
                    background: transparent;
                    border: none;
                    color: #555;
                    cursor: pointer;
                    padding: 4px;
                }
                .btn-delete-plain:hover { color: #ef4444; }
                .channels-grid-container {
                    padding: 16px;
                    background: #111;
                    max-height: 400px;
                    overflow-y: auto;
                }
                .channels-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 6px;
                }
                .channel-btn {
                    background: #222;
                    border: 1px solid #333;
                    border-radius: 4px;
                    padding: 6px;
                    display: flex;
                    flex-direction: column;
                    align-items: flex-start;
                    cursor: pointer;
                    transition: all 0.2s;
                    text-align: left;
                }
                .channel-btn:hover { border-color: #555; background: #2a2a2a; }
                .channel-btn.selected {
                    background: #e82020;
                    border-color: #ff4d4d;
                    box-shadow: 0 0 10px rgba(232, 32, 32, 0.4);
                }
                .ch-num { font-size: 10px; font-weight: bold; color: #888; margin-bottom: 2px; }
                .selected .ch-num { color: rgba(255,255,255,0.7); }
                .ch-name { font-size: 11px; color: #ccc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; }
                .selected .ch-name { color: white; font-weight: 500; }
            `}</style>
        </div>
    );
}
