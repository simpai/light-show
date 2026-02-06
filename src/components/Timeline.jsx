import React, { useRef, useEffect, useState } from 'react';
import { ProjectState } from '../core/ProjectState';
import { Settings, Eye, EyeOff } from 'lucide-react';

export function Timeline({ project, currentTime, duration, zoom, snapMode, bpm, onClipSelect, selectedClipIds = [], selectedLayerId, onLayerSelect, onLayerDoubleClick, onSeek, onProjectChange, onZoomChange, bookmarks = [], onToggleBookmark, onBookmarkMove }) {
    const pixelsPerSecond = zoom || 50;
    const totalWidth = (duration / 1000) * pixelsPerSecond;
    const trackHeaderWidth = 150;

    const rulerScrollRef = useRef(null);
    const lanesScrollRef = useRef(null);

    const [draggingClips, setDraggingClips] = useState([]);
    const [dragOffset, setDragOffset] = useState(0); // Offset within primary clip in ms
    const [marquee, setMarquee] = useState(null); // { startX, startY, endX, endY }

    // Synchronize scroll between ruler and lanes
    const handleRulerScroll = (e) => {
        if (lanesScrollRef.current) {
            lanesScrollRef.current.scrollLeft = e.target.scrollLeft;
        }
    };

    const handleLanesScroll = (e) => {
        if (rulerScrollRef.current) {
            rulerScrollRef.current.scrollLeft = e.target.scrollLeft;
        }
    };

    // Generate time markers
    const markers = [];
    for (let i = 0; i < duration / 1000; i += 1) {
        markers.push(i);
    }

    // Get audio analysis markers
    const analysis = project.analysis;
    const beatMarkers = analysis?.beat_times || [];
    const onsetMarkers = analysis?.onset_times || [];

    useEffect(() => {
        const handleWheelManual = (e) => {
            if (e.ctrlKey) {
                e.preventDefault();
                // Zoom logic
                const zoomAmount = e.deltaY > 0 ? 0.9 : 1.1;
                const newZoom = Math.max(10, Math.min(200, zoom * zoomAmount));
                if (onZoomChange) onZoomChange(newZoom);
            } else if (e.shiftKey) {
                e.preventDefault();
                // Horizontal scroll logic
                if (lanesScrollRef.current) {
                    lanesScrollRef.current.scrollLeft += e.deltaY;
                }
            }
            // Otherwise, let default vertical scroll happen
        };

        const ruler = rulerScrollRef.current;
        const lanes = lanesScrollRef.current;

        if (ruler) ruler.addEventListener('wheel', handleWheelManual, { passive: false });
        if (lanes) lanes.addEventListener('wheel', handleWheelManual, { passive: false });

        return () => {
            if (ruler) ruler.removeEventListener('wheel', handleWheelManual);
            if (lanes) lanes.removeEventListener('wheel', handleWheelManual);
        };
    }, [zoom, onZoomChange]);

    // Dynamic snap interval
    let snapIntervalMs = null;
    if (snapMode !== 'off') {
        const beatDurationMs = (60 / (bpm || 120)) * 1000;
        const multiplier = snapMode === '1' ? 1
            : snapMode === '1/2' ? 0.5
                : snapMode === '1/4' ? 0.25
                    : 0.125;
        snapIntervalMs = beatDurationMs * multiplier;
    }

    // Prepare snap candidates (shared for seeking and dragging)
    const snapCandidates = [0, ...beatMarkers.map(t => t * 1000), ...onsetMarkers.map(t => t * 1000)];
    if (snapIntervalMs) {
        for (let t = 0; t <= duration; t += snapIntervalMs) {
            snapCandidates.push(t);
        }
    }

    const getSnappedTime = (timeMs) => {
        if (snapMode === 'off') return timeMs;
        const thresholdMs = 100 / (pixelsPerSecond / 50);
        let snappedTime = timeMs;
        let minDiff = thresholdMs;

        snapCandidates.forEach(snap => {
            const diff = Math.abs(timeMs - snap);
            if (diff < minDiff) {
                minDiff = diff;
                snappedTime = snap;
            }
        });
        return snappedTime;
    };

    const handleRulerMouseDown = (e) => {
        const rect = rulerScrollRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left + rulerScrollRef.current.scrollLeft;
        const clickedTime = (x / pixelsPerSecond) * 1000;
        const snappedTimeMs = getSnappedTime(clickedTime);

        // Find bookmark near clicked position
        const thresholdPx = 10;
        const thresholdMs = (thresholdPx / pixelsPerSecond) * 1000;
        const nearbyBookmark = bookmarks.find(b => Math.abs(b - clickedTime) <= thresholdMs);

        if (nearbyBookmark !== undefined) {
            if (e.ctrlKey) {
                onToggleBookmark(nearbyBookmark);
                return;
            } else {
                // Dragging logic for bookmark
                let lastTime = nearbyBookmark;
                document.body.style.cursor = 'grabbing';

                const handleMouseMove = (moveEvent) => {
                    const moveX = moveEvent.clientX - rect.left + rulerScrollRef.current.scrollLeft;
                    const newTime = Math.max(0, (moveX / pixelsPerSecond) * 1000);
                    const snapped = getSnappedTime(newTime);

                    if (Math.abs(snapped - lastTime) > 1 && onBookmarkMove) {
                        onBookmarkMove(lastTime, snapped);
                        lastTime = snapped;
                    }
                };

                const handleMouseUp = () => {
                    document.body.style.cursor = '';
                    document.removeEventListener('mousemove', handleMouseMove);
                    document.removeEventListener('mouseup', handleMouseUp);
                };

                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
                return;
            }
        }

        if (e.ctrlKey && onToggleBookmark) {
            onToggleBookmark(snappedTimeMs);
            return;
        }

        const seek = (moveEvent) => {
            if (!rect || !rulerScrollRef.current) return;
            const x = moveEvent.clientX - rect.left + rulerScrollRef.current.scrollLeft;
            const timeInSeconds = x / pixelsPerSecond;
            const timeInMs = timeInSeconds * 1000;

            const snappedTimeMs = getSnappedTime(timeInMs);

            if (onSeek) {
                onSeek(Math.max(0, Math.min(snappedTimeMs, duration)));
            }
        };

        seek(e); // Initial seek on mouse down

        const handleMouseMove = (moveEvent) => {
            seek(moveEvent);
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleLaneMouseDown = (e, layerId) => {
        // Marquee selection with Shift
        if (e.shiftKey) {
            const laneContainer = e.currentTarget.closest('.track-lanes');
            const rect = laneContainer.getBoundingClientRect();
            const startX = e.clientX - rect.left;
            const startY = e.clientY - rect.top;

            const handleMouseMove = (moveEvent) => {
                const curX = Math.max(0, moveEvent.clientX - rect.left);
                const curY = Math.max(0, moveEvent.clientY - rect.top);
                setMarquee({ startX, startY, endX: curX, endY: curY });
            };

            const handleMouseUp = (upEvent) => {
                setMarquee(final => {
                    if (final) {
                        const x1 = Math.min(final.startX, final.endX);
                        const x2 = Math.max(final.startX, final.endX);
                        const y1 = Math.min(final.startY, final.endY);
                        const y2 = Math.max(final.startY, final.endY);

                        const startTime = (x1 / pixelsPerSecond) * 1000;
                        const endTime = (x2 / pixelsPerSecond) * 1000;
                        const startLayerIdx = Math.floor(y1 / 50);
                        const endLayerIdx = Math.ceil(y2 / 50) - 1;

                        const selectedIds = [];
                        project.layers.forEach((layer, idx) => {
                            if (idx >= startLayerIdx && idx <= endLayerIdx) {
                                layer.clips.forEach(clip => {
                                    const clipStart = clip.startTime;
                                    const clipEnd = clip.startTime + clip.duration;
                                    if (clipStart < endTime && clipEnd > startTime) {
                                        selectedIds.push(clip.id);
                                    }
                                });
                            }
                        });

                        if (onClipSelect) onClipSelect(selectedIds, upEvent);
                    }
                    return null;
                });
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            return;
        }

        // Only trigger if clicking on the lane itself, not on a clip
        if (e.target !== e.currentTarget && !e.target.classList.contains('grid-line')) return;

        if (onClipSelect) onClipSelect(null);
        onLayerSelect(layerId);

        const rect = lanesScrollRef.current.getBoundingClientRect();

        const seek = (moveEvent) => {
            if (!rect || !lanesScrollRef.current) return;
            const x = moveEvent.clientX - rect.left + lanesScrollRef.current.scrollLeft - trackHeaderWidth;
            const timeInMs = (x / pixelsPerSecond) * 1000;
            const snappedTimeMs = getSnappedTime(timeInMs);

            if (onSeek) {
                onSeek(Math.max(0, Math.min(snappedTimeMs, duration)));
            }
        };

        seek(e);

        const handleMouseMove = (moveEvent) => {
            seek(moveEvent);
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleDragStart = (e, primaryClip, primaryLayerId) => {
        e.stopPropagation();

        const isCtrl = e.ctrlKey || e.metaKey;
        const isPrimarySelected = selectedClipIds.includes(primaryClip.id);

        if (isCtrl || !isPrimarySelected) {
            if (onClipSelect) onClipSelect(primaryClip.id, e);
            // If toggle-deselecting, don't start a drag
            if (isCtrl && isPrimarySelected) return;
        }

        // Determine which clips to drag
        let clipsToDrag = [];
        if (isPrimarySelected) {
            // Drag all selected clips
            selectedClipIds.forEach(id => {
                for (const layer of project.layers) {
                    const found = layer.clips.find(c => c.id === id);
                    if (found) {
                        clipsToDrag.push({ ...found, originalStartTime: found.startTime, originalDuration: found.duration, layerId: layer.id });
                        break;
                    }
                }
            });
        } else {
            // Drag only this clip (even if it was just selected via Ctrl/Single-click)
            clipsToDrag = [{ ...primaryClip, originalStartTime: primaryClip.startTime, originalDuration: primaryClip.duration, layerId: primaryLayerId }];
        }

        // If it's a multi-selection but we clicked a non-selected clip WITHOUT Ctrl, 
        // the onClipSelect above will handle the selection change in parent, 
        // but for the immediate drag we use this clip.

        onLayerSelect(primaryLayerId);

        const rect = e.currentTarget.getBoundingClientRect();
        const xInClipPx = e.clientX - rect.left;
        const xInClipMs = (xInClipPx / pixelsPerSecond) * 1000;

        // Detect if resizing (only allowed when dragging a single clip)
        let dragMode = 'move';
        if (clipsToDrag.length === 1) {
            const isEffect = primaryClip.type === 'effect';
            const resizeThresholdPx = 8;
            if (isEffect) {
                if (xInClipPx < resizeThresholdPx) dragMode = 'resize-left';
                else if (xInClipPx > rect.width - resizeThresholdPx) dragMode = 'resize-right';
            }
        }

        const isDuplicateMode = e.altKey;

        const draggingClipsWithMode = clipsToDrag.map(c => ({
            ...c,
            dragMode: c.id === primaryClip.id ? dragMode : 'move',
            isDuplicateMode,
            // Store offset relative to the PRIMARY clip's start time
            relativeOffset: c.startTime - primaryClip.startTime
        }));

        setDraggingClips(draggingClipsWithMode);
        setDragOffset(xInClipMs);

        const handleMouseMove = (moveEvent) => {
            if (!lanesScrollRef.current) return;
            const laneRect = lanesScrollRef.current.getBoundingClientRect();
            const xInLanePx = moveEvent.clientX - laneRect.left + lanesScrollRef.current.scrollLeft - trackHeaderWidth;
            const currentTimeMs = (xInLanePx / pixelsPerSecond) * 1000;

            setDraggingClips(prev => {
                if (!prev || prev.length === 0) return [];

                // Find the primary clip in the dragging set
                const primary = prev.find(c => c.id === primaryClip.id);
                if (!primary) return prev;

                const snappedTime = getSnappedTime(currentTimeMs);

                if (primary.dragMode === 'resize-left') {
                    const newStart = Math.max(0, snappedTime);
                    const diff = primary.startTime - newStart;
                    const newDuration = Math.max(20, primary.duration + diff);
                    return prev.map(c => c.id === primary.id ? { ...c, startTime: newStart, duration: newDuration } : c);
                } else if (primary.dragMode === 'resize-right') {
                    const newEnd = snappedTime;
                    const newDuration = Math.max(20, newEnd - primary.startTime);
                    return prev.map(c => c.id === primary.id ? { ...c, duration: newDuration } : c);
                } else {
                    // Move mode for all
                    const primaryNewTimeMs = (xInLanePx / pixelsPerSecond) * 1000 - xInClipMs;
                    const snappedPrimaryTime = getSnappedTime(primaryNewTimeMs);
                    const clampedPrimaryTime = Math.max(0, snappedPrimaryTime);

                    // All other clips move relative to the primary clip's snapped position
                    return prev.map(c => ({
                        ...c,
                        startTime: Math.max(0, clampedPrimaryTime + c.relativeOffset)
                    }));
                }
            });
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);

            setDraggingClips(prev => {
                if (prev && prev.length > 0) {
                    // Check if anything actually moved
                    const hasMoved = prev.some(c =>
                        Math.abs(c.startTime - c.originalStartTime) > 1 ||
                        Math.abs(c.duration - c.originalDuration) > 1
                    );

                    if (hasMoved) {
                        const json = project.toJSON();
                        const newProject = ProjectState.fromJSONSync(json);
                        newProject.assets = project.assets;

                        const isDuplicating = prev[0]?.isDuplicateMode;
                        const newSelectionIds = [];

                        prev.forEach(dragging => {
                            const layer = newProject.layers.find(l => l.id === dragging.layerId);
                            if (layer) {
                                if (isDuplicating) {
                                    // Clone mode
                                    const newClip = {
                                        ...dragging,
                                        id: crypto.randomUUID(),
                                        // startTime and duration already set to new values in dragging state
                                    };
                                    delete newClip.originalStartTime;
                                    delete newClip.originalDuration;
                                    delete newClip.relativeOffset;
                                    delete newClip.isDuplicateMode;
                                    delete newClip.dragMode;
                                    delete newClip.layerId;

                                    layer.clips.push(newClip);
                                    newSelectionIds.push(newClip.id);
                                } else {
                                    // Move mode
                                    const clipIdx = layer.clips.findIndex(c => c.id === dragging.id);
                                    if (clipIdx !== -1) {
                                        layer.clips[clipIdx].startTime = dragging.startTime;
                                        layer.clips[clipIdx].duration = dragging.duration;
                                    }
                                }
                            }
                        });

                        if (onProjectChange) onProjectChange(newProject);

                        // Select new clones if duplicated
                        if (isDuplicating && newSelectionIds.length > 0 && onClipSelect) {
                            // Single batch selection in parent
                            if (newSelectionIds.length === 1) {
                                onClipSelect(newSelectionIds[0], { ctrlKey: false });
                            } else {
                                // Clear and then add (or just pass array if onClipSelect supports it)
                                // Since we don't know if onClipSelect supports arrays, we'll assume it's the standard handler
                                onClipSelect(newSelectionIds[0], { ctrlKey: false });
                                newSelectionIds.slice(1).forEach(id => {
                                    onClipSelect(id, { ctrlKey: true });
                                });
                            }
                        }
                    }
                }
                return [];
            });
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    return (
        <div className="timeline-container">
            {/* Fixed header row */}
            <div className="timeline-header-row">
                <div className="timeline-corner" style={{ width: trackHeaderWidth }}>
                    <button
                        className="global-visibility-btn"
                        onClick={() => {
                            const allMuted = project.layers.every(l => l.muted);
                            const json = project.toJSON();
                            const newProject = ProjectState.fromJSONSync(json);
                            newProject.assets = project.assets;
                            newProject.layers.forEach(l => l.muted = !allMuted);
                            if (onProjectChange) onProjectChange(newProject);
                        }}
                        title="Toggle All Tracks Visibility"
                    >
                        {project.layers.every(l => l.muted) ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                </div>
                <div
                    className="timeline-ruler-container"
                    ref={rulerScrollRef}
                    onScroll={handleRulerScroll}
                    onMouseDown={handleRulerMouseDown}
                >
                    <div className="ruler" style={{ width: totalWidth }}>
                        {/* Time markers */}
                        {markers.map(s => (
                            <div
                                key={`time-${s}`}
                                className="ruler-mark"
                                style={{ left: s * pixelsPerSecond }}
                            >
                                {s}s
                            </div>
                        ))}

                        {/* Beat markers (blue) */}
                        {beatMarkers.map((time, idx) => (
                            <div
                                key={`beat-${idx}`}
                                className="beat-marker"
                                style={{ left: time * pixelsPerSecond }}
                                title={`Beat at ${time.toFixed(2)}s`}
                            />
                        ))}

                        {/* Onset markers (yellow) */}
                        {onsetMarkers.map((time, idx) => (
                            <div
                                key={`onset-${idx}`}
                                className="onset-marker"
                                style={{ left: time * pixelsPerSecond }}
                                title={`Onset at ${time.toFixed(2)}s`}
                            />
                        ))}

                        {/* Bookmarks in Ruler */}
                        {bookmarks.map((time, i) => (
                            <div
                                key={`b-ruler-${time}-${i}`}
                                className="bookmark-marker-ruler"
                                style={{ left: (time / 1000) * pixelsPerSecond }}
                            />
                        ))}

                        {/* Playhead in Ruler */}
                        <div className="playhead ruler-playhead" style={{ left: (currentTime / 1000) * pixelsPerSecond }} />
                    </div>
                </div>
            </div>

            {/* Tracks area with scroll */}
            <div
                className="timeline-tracks-row"
                ref={lanesScrollRef}
                onScroll={handleLanesScroll}
            >
                {/* Fixed track headers */}
                <div className="track-headers-fixed" style={{ width: trackHeaderWidth }}>
                    {project.layers.map(layer => (
                        <div
                            key={layer.id}
                            className={`track-header ${selectedLayerId === layer.id ? 'selected' : ''}`}
                            onClick={() => onLayerSelect(layer.id)}
                            onDoubleClick={() => onLayerDoubleClick && onLayerDoubleClick(layer.id)}
                        >
                            <button
                                className={`track-visibility-btn ${layer.muted ? 'muted' : ''}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const json = project.toJSON();
                                    const newProject = ProjectState.fromJSONSync(json);
                                    newProject.assets = project.assets;
                                    const l = newProject.layers.find(l => l.id === layer.id);
                                    if (l) {
                                        l.muted = !l.muted;
                                        if (onProjectChange) onProjectChange(newProject);
                                    }
                                }}
                                title={layer.muted ? "Show Track" : "Hide Track"}
                            >
                                {layer.muted ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', opacity: layer.muted ? 0.5 : 1 }}>{layer.name}</span>
                            <button
                                className="track-settings-btn"
                                tabIndex={-1}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    e.currentTarget.blur();
                                    onLayerSelect(layer.id);
                                    onLayerDoubleClick(layer.id);
                                }}
                                title="Track Settings"
                            >
                                <Settings size={14} />
                            </button>
                        </div>
                    ))}
                </div>

                {/* Scrollable track lanes */}
                <div
                    className="timeline-tracks"
                    style={{ flex: 1, position: 'relative' }}
                >
                    <div className="track-lanes" style={{ width: totalWidth }}>
                        {/* Grid lines */}
                        {snapIntervalMs && Array.from({ length: Math.ceil(duration / snapIntervalMs) + 1 }).map((_, i) => {
                            const t = i * snapIntervalMs;
                            return (
                                <div
                                    key={`grid-${t}`}
                                    className="grid-line"
                                    style={{ left: (t / 1000) * pixelsPerSecond }}
                                />
                            );
                        })}

                        {/* Bookmarks in Tracks */}
                        {bookmarks.map((time, i) => (
                            <div
                                key={`b-track-${time}-${i}`}
                                className="bookmark-marker-track"
                                style={{ left: (time / 1000) * pixelsPerSecond }}
                            />
                        ))}

                        {project.layers.map(layer => (
                            <div
                                key={layer.id}
                                className={`track-lane ${selectedLayerId === layer.id ? 'selected' : ''} ${layer.muted ? 'muted' : ''}`}
                                onMouseDown={(e) => handleLaneMouseDown(e, layer.id)}
                            >
                                {layer.clips.map(clip => {
                                    const dragging = draggingClips.find(c => c.id === clip.id);
                                    const isDragging = !!dragging;
                                    const isDuplicating = isDragging && dragging.isDuplicateMode;

                                    // In move mode, we show the dragging version.
                                    // In duplicate mode, we show the original version here.
                                    const displayClip = (isDragging && !isDuplicating) ? dragging : clip;

                                    const clipWidth = (displayClip.duration / 1000) * pixelsPerSecond;
                                    const clipLeft = (displayClip.startTime / 1000) * pixelsPerSecond;

                                    const usedGroups = [];
                                    const isSymbolic = Array.isArray(clip.targetLightGroups);

                                    if (isSymbolic && project.lightGroups) {
                                        clip.targetLightGroups.forEach(groupName => {
                                            const group = project.lightGroups[groupName];
                                            if (group) {
                                                usedGroups.push({ name: groupName, color: group.color });
                                            }
                                        });
                                    } else if (clip.type === 'effect' && clip.channels && project.lightGroups) {
                                        Object.entries(project.lightGroups).forEach(([name, data]) => {
                                            const groupChannels = data.channels || [];
                                            if (clip.channels.some(ch => groupChannels.includes(ch))) {
                                                usedGroups.push({ name, color: data.color });
                                            }
                                        });
                                    }

                                    return (
                                        <div
                                            key={clip.id}
                                            className={`clip ${isDragging && !isDuplicating ? 'dragging' : ''} ${selectedClipIds.includes(clip.id) ? 'selected' : ''} ${clip.type}`}
                                            onMouseDown={(e) => handleDragStart(e, clip, layer.id)}
                                            style={{
                                                left: clipLeft,
                                                width: clipWidth,
                                                background: (() => {
                                                    // 1. Determine Base Color/Gradient (vertical stripes for groups)
                                                    let baseStyle = '#444'; // Default
                                                    if (clip.type === 'gif') {
                                                        baseStyle = '#4a90e2';
                                                    } else if (usedGroups.length === 1) {
                                                        baseStyle = usedGroups[0].color;
                                                    } else if (usedGroups.length > 1) {
                                                        const segments = usedGroups.map((g, i) => {
                                                            const start = (i / usedGroups.length) * 100;
                                                            const end = ((i + 1) / usedGroups.length) * 100;
                                                            return `${g.color} ${start}%, ${g.color} ${end}%`;
                                                        });
                                                        baseStyle = `linear-gradient(to bottom, ${segments.join(', ')})`;
                                                    }

                                                    // 2. Handle Ramping (horizontal shading overlay)
                                                    if (clip.rampingEnabled) {
                                                        const rampOnPct = (clip.rampOnEnabled !== false) ? ((clip.rampOnDuration || 500) / clip.duration) * 100 : 0;
                                                        const rampOffPct = (clip.rampOffEnabled !== false) ? ((clip.rampOffDuration || 500) / clip.duration) * 100 : 0;

                                                        const stops = [];
                                                        const darkColor = 'rgba(0,0,0,0.85)';

                                                        if (rampOnPct > 0) {
                                                            stops.push(`${darkColor} 0%`);
                                                            stops.push(`transparent ${rampOnPct}%`);
                                                        } else {
                                                            stops.push(`transparent 0%`);
                                                        }

                                                        if (rampOffPct > 0) {
                                                            stops.push(`transparent ${100 - rampOffPct}%`);
                                                            stops.push(`${darkColor} 100%`);
                                                        } else {
                                                            stops.push(`transparent 100%`);
                                                        }

                                                        const shading = `linear-gradient(to right, ${stops.join(', ')})`;
                                                        return `${shading}, ${baseStyle}`;
                                                    }

                                                    return baseStyle;
                                                })(),
                                                zIndex: (isDragging && !isDuplicating) ? 20 : (selectedClipIds.includes(clip.id) ? 5 : 1),
                                                position: 'absolute',
                                                display: 'flex',
                                                flexDirection: 'row'
                                            }}
                                            title={`${clip.effectType || 'Clip'} | Start: ${(displayClip.startTime / 1000).toFixed(2)}s | Duration: ${(clip.duration / 1000).toFixed(2)}s`}
                                        >
                                            <div className="resize-handle left" />
                                            <div className="clip-content" style={{ flex: 1, display: 'flex', alignItems: 'center', position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
                                                {/* <span className="clip-label" style={{ zIndex: 2 }}>{clip.effectType || 'Clip'}</span> */}
                                            </div>
                                            <div className="resize-handle right" />
                                        </div>
                                    );
                                })}

                                {/* Duplicate previews - rendered as separate semi-transparent elements */}
                                {draggingClips.filter(c => c.layerId === layer.id && c.isDuplicateMode).map(dragging => {
                                    const clipWidth = (dragging.duration / 1000) * pixelsPerSecond;
                                    const clipLeft = (dragging.startTime / 1000) * pixelsPerSecond;

                                    const usedGroups = [];
                                    const isSymbolic = Array.isArray(dragging.targetLightGroups);

                                    if (isSymbolic && project.lightGroups) {
                                        dragging.targetLightGroups.forEach(groupName => {
                                            const group = project.lightGroups[groupName];
                                            if (group) {
                                                usedGroups.push({ name: groupName, color: group.color });
                                            }
                                        });
                                    } else if (dragging.type === 'effect' && dragging.channels && project.lightGroups) {
                                        Object.entries(project.lightGroups).forEach(([name, data]) => {
                                            const groupChannels = data.channels || [];
                                            if (dragging.channels.some(ch => groupChannels.includes(ch))) {
                                                usedGroups.push({ name, color: data.color });
                                            }
                                        });
                                    }

                                    return (
                                        <div
                                            key={`preview-${dragging.id}`}
                                            className={`clip dragging preview ${dragging.type}`}
                                            style={{
                                                left: clipLeft,
                                                width: clipWidth,
                                                background: (() => {
                                                    let baseStyle = '#444';
                                                    if (dragging.type === 'gif') {
                                                        baseStyle = '#4a90e2';
                                                    } else if (usedGroups.length === 1) {
                                                        baseStyle = usedGroups[0].color;
                                                    } else if (usedGroups.length > 1) {
                                                        const segments = usedGroups.map((g, i) => {
                                                            const start = (i / usedGroups.length) * 100;
                                                            const end = ((i + 1) / usedGroups.length) * 100;
                                                            return `${g.color} ${start}%, ${g.color} ${end}%`;
                                                        });
                                                        baseStyle = `linear-gradient(to bottom, ${segments.join(', ')})`;
                                                    }

                                                    if (dragging.rampingEnabled) {
                                                        const rampOnPct = (dragging.rampOnEnabled !== false) ? ((dragging.rampOnDuration || 500) / dragging.duration) * 100 : 0;
                                                        const rampOffPct = (dragging.rampOffEnabled !== false) ? ((dragging.rampOffDuration || 500) / dragging.duration) * 100 : 0;

                                                        const stops = [];
                                                        const darkColor = 'rgba(0,0,0,0.85)';

                                                        if (rampOnPct > 0) {
                                                            stops.push(`${darkColor} 0%`);
                                                            stops.push(`transparent ${rampOnPct}%`);
                                                        } else {
                                                            stops.push(`transparent 0%`);
                                                        }

                                                        if (rampOffPct > 0) {
                                                            stops.push(`transparent ${100 - rampOffPct}%`);
                                                            stops.push(`${darkColor} 100%`);
                                                        } else {
                                                            stops.push(`transparent 100%`);
                                                        }

                                                        const shading = `linear-gradient(to right, ${stops.join(', ')})`;
                                                        return `${shading}, ${baseStyle}`;
                                                    }
                                                    return baseStyle;
                                                })(),
                                                opacity: 0.5,
                                                zIndex: 20,
                                                pointerEvents: 'none',
                                                display: 'flex',
                                                flexDirection: 'row'
                                            }}
                                        >
                                            <div className="clip-content" style={{ flex: 1, display: 'flex', alignItems: 'center', position: 'relative', width: '100%', overflow: 'hidden' }}>
                                            </div>
                                        </div>
                                    );
                                })}

                            </div>
                        ))}

                        {marquee && (
                            <div
                                className="marquee-selector"
                                style={{
                                    left: Math.min(marquee.startX, marquee.endX),
                                    top: Math.min(marquee.startY, marquee.endY),
                                    width: Math.abs(marquee.startX - marquee.endX),
                                    height: Math.abs(marquee.startY - marquee.endY),
                                }}
                            />
                        )}

                        {/* Playhead in Tracks */}
                        <div className="playhead track-playhead" style={{ left: (currentTime / 1000) * pixelsPerSecond }} />
                    </div>
                </div>
            </div>

            <style>{`
                .timeline-container { display: flex; flex-direction: column; height: 100%; background: #151515; user-select: none; }
                .timeline-header-row { display: flex; border-bottom: 1px solid #333; flex-shrink: 0; }
                .timeline-corner { background: #1f1f1f; border-right: 1px solid #333; flex-shrink: 0; }
                .timeline-ruler-container { flex: 1; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; -ms-overflow-style: none; }
                .timeline-ruler-container::-webkit-scrollbar { display: none; }
                .ruler { height: 40px; position: relative; background: #1a1a1a; }
                .ruler-mark { position: absolute; top: 0; font-size: 10px; color: #666; border-left: 1px solid #333; padding-left: 2px; height: 100%; }
                .beat-marker { position: absolute; bottom: 0; width: 2px; height: 15px; background: #4a90e2; opacity: 0.6; }
                .onset-marker { position: absolute; bottom: 0; width: 2px; height: 10px; background: #fbbf24; opacity: 0.7; }
                .timeline-tracks-row { display: flex; flex: 1; overflow: auto; position: relative; }
                .track-headers-fixed { flex-shrink: 0; border-right: 1px solid #333; position: sticky; left: 0; z-index: 15; background: #151515; }
                .track-header { height: 50px; background: #1f1f1f; display: flex; align-items: center; justify-content: space-between; padding: 0 10px; font-size: 12px; cursor: pointer; transition: background 0.2s; border-bottom: 1px solid #222; }
                .track-header:hover { background: #2a2a2a; }
                .track-header.selected { background: #451a1a; border-left: 3px solid #e82020; }
                .track-settings-btn {
                    background: transparent;
                    border: none;
                    color: #555;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 4px;
                    border-radius: 4px;
                    transition: all 0.2s;
                }
                .track-settings-btn:hover {
                    color: white;
                    background: #444;
                }
                .track-header.selected .track-settings-btn {
                    color: #888;
                }
                .track-header.selected .track-settings-btn:hover {
                    color: white;
                    background: #e82020;
                }
                .timeline-corner {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .global-visibility-btn, .track-visibility-btn {
                    background: transparent;
                    border: none;
                    color: #555;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 4px;
                    border-radius: 4px;
                    transition: all 0.2s;
                }
                .global-visibility-btn:hover, .track-visibility-btn:hover {
                    color: white;
                    background: #444;
                }
                .track-visibility-btn {
                    margin-right: 4px;
                }
                .track-visibility-btn.muted {
                    color: #e82020;
                }
                .timeline-tracks { flex: 1; min-width: 0; }
                .track-lanes { position: relative; min-height: 100%; }
                .track-lane { height: 50px; position: relative; background: #151515; border-bottom: 1px solid #222; cursor: crosshair; }
                .track-lane.selected { background: #2a1515; }
                .grid-line {
                    position: absolute;
                    top: 0;
                    bottom: 0;
                    width: 1px;
                    background: rgba(255, 255, 255, 0.05);
                    pointer-events: none;
                    z-index: 0;
                }
                .clip { position: absolute; top: 5px; bottom: 5px; border-radius: 4px; cursor: move; opacity: 0.8; display: flex; align-items: center; font-size: 11px; overflow: hidden; white-space: nowrap; transition: opacity 0.1s; border: 1px solid rgba(255,255,255,0.1); }
                .track-lane.muted .clip { opacity: 0.2; pointer-events: none; }
                .clip.effect { cursor: move; }
                .clip:hover { opacity: 1; outline: 1px solid white; outline-offset: -1px; }
                .clip.selected { opacity: 1; outline: 2px solid #22c55e; outline-offset: -1px; z-index: 5; box-shadow: 0 0 8px rgba(34, 197, 94, 0.4); }
                .clip.dragging { opacity: 0.6; pointer-events: none; outline: 2px solid #e82020; box-shadow: 0 0 15px rgba(232, 32, 32, 0.5); }
                .marquee-selector {
                    position: absolute;
                    background: rgba(34, 197, 94, 0.1);
                    border: 1px solid #22c55e;
                    pointer-events: none;
                    z-index: 100;
                    border-radius: 2px;
                }
                .resize-handle {
                    position: absolute;
                    top: 0;
                    bottom: 0;
                    width: 8px;
                    background: rgba(34, 197, 94, 0.4);
                    cursor: ew-resize !important;
                    display: none;
                    z-index: 20;
                    transition: all 0.1s;
                }
                .clip:hover .resize-handle { display: block; }
                .resize-handle:hover { 
                    background: #22c55e !important;
                    width: 10px;
                    box-shadow: 0 0 8px rgba(34, 197, 94, 1);
                }
                .resize-handle.left { left: 0; border-radius: 4px 0 0 4px; border-right: 1px solid rgba(0,0,0,0.2); }
                .resize-handle.right { right: 0; border-radius: 0 4px 4px 0; border-left: 1px solid rgba(0,0,0,0.2); }
                .clip-label { padding: 0 5px; pointer-events: none; flex: 1; text-align: center; }
                .playhead { position: absolute; top: 0; bottom: 0; width: 2px; background: #e82020; z-index: 10; pointer-events: none; }
                .bookmark-marker-ruler { 
                    position: absolute; 
                    top: 0; 
                    width: 14px; 
                    height: 18px; 
                    background: #22c55e; 
                    clip-path: polygon(0% 0%, 100% 0%, 100% 70%, 50% 100%, 0% 70%);
                    transform: translateX(-50%); 
                    z-index: 20; 
                    cursor: grab;
                }
                .bookmark-marker-ruler:hover { background: #4ade80; }
                .bookmark-marker-track { position: absolute; top: 0; bottom: 0; width: 1px; background: #22c55e; opacity: 0.3; z-index: 5; pointer-events: none; }
            `}</style>
        </div>
    );
}
