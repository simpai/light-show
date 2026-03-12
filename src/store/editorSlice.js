export const createEditorSlice = (set, get) => ({
    selectedClipIds: [],
    selectedLayerId: null,
    selectedPaletteClipId: null,

    zoom: parseFloat(localStorage.getItem('ls_editor_zoom')) || 50,
    snapMode: localStorage.getItem('ls_editor_snap') || '1/4',
    bookmarks: [],
    clipboard: null,

    showHelpModal: false,
    showGroundLight: true,
    activeModal: null, // 'lightGroups', 'trackProperties', 'carGroups'
    selectedCars: new Set(),
    showLayoutEditor: false,
    fitTrigger2D: 0,

    paletteCollapsed: localStorage.getItem('ls_editor_palette_collapsed') === 'true',
    timelineHeight: parseInt(localStorage.getItem('ls_editor_timeline_height')) || 350,
    consoleMessages: [],
    previewMode: localStorage.getItem('ls_editor_preview_mode') || 'matrix', // 'matrix' (old) | 'car' (new image-based)

    // Actions
    setSelectedClipIds: (ids) => set({ selectedClipIds: typeof ids === 'function' ? ids(get().selectedClipIds) : ids }),
    setSelectedLayerId: (id) => set({ selectedLayerId: id }),
    setSelectedPaletteClipId: (id) => set({ selectedPaletteClipId: id }),

    setZoom: (zoom) => {
        localStorage.setItem('ls_editor_zoom', zoom);
        set({ zoom: typeof zoom === 'function' ? zoom(get().zoom) : zoom });
    },
    setSnapMode: (snapMode) => {
        localStorage.setItem('ls_editor_snap', snapMode);
        set({ snapMode });
    },
    setBookmarks: (bookmarks) => set({ bookmarks: typeof bookmarks === 'function' ? bookmarks(get().bookmarks) : bookmarks }),
    setClipboard: (clipboard) => set({ clipboard }),

    setShowHelpModal: (show) => set({ showHelpModal: show }),
    setShowGroundLight: (show) => set({ showGroundLight: show }),
    setActiveModal: (modal) => set({ activeModal: modal }),
    setSelectedCars: (cars) => set({ selectedCars: typeof cars === 'function' ? cars(get().selectedCars) : cars }),
    setShowLayoutEditor: (show) => set({ showLayoutEditor: show }),
    setFitTrigger2D: (trigger) => set({ fitTrigger2D: trigger }),

    setPaletteCollapsed: (collapsed) => {
        localStorage.setItem('ls_editor_palette_collapsed', collapsed);
        set({ paletteCollapsed: collapsed });
    },
    setTimelineHeight: (height) => {
        localStorage.setItem('ls_editor_timeline_height', height);
        set({ timelineHeight: height });
    },
    setPreviewMode: (mode) => {
        localStorage.setItem('ls_editor_preview_mode', mode);
        set({ previewMode: mode });
    },

    setMatrixConfig: (config) => {
        set(state => ({
            matrixConfig: { ...state.matrixConfig, ...config }
        }));
    },

    addConsoleLog: (msg, type = 'info', isProgress = false) => {
        const newId = crypto.randomUUID();
        let targetId = newId;

        set(state => {
            const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
            
            if (isProgress && state.consoleMessages.length > 0) {
                const lastMsg = state.consoleMessages[state.consoleMessages.length - 1];
                if (lastMsg.isProgress) {
                    // Update the last progress message instead of adding a new one
                    targetId = lastMsg.id;
                    const updatedMessages = [...state.consoleMessages];
                    updatedMessages[updatedMessages.length - 1] = { ...lastMsg, text: msg, timestamp, createdAt: Date.now() };
                    return { consoleMessages: updatedMessages };
                }
            }
            
            // New message
            const newMessage = { id: newId, text: msg, type, timestamp, isProgress, createdAt: Date.now() };
            const newMessages = [...state.consoleMessages, newMessage].slice(-50);
            return { consoleMessages: newMessages };
        });

        // Auto-remove after 5 seconds
        // Re-check createdAt to ensure we don't remove it if it was updated recently (for progress)
        setTimeout(() => {
            set(state => {
                const msgIdx = state.consoleMessages.findIndex(m => m.id === targetId);
                if (msgIdx === -1) return state;
                
                const msgObj = state.consoleMessages[msgIdx];
                // If it hasn't been updated in the last 4.9s, remove it
                if (Date.now() - msgObj.createdAt >= 4900) {
                    return { consoleMessages: state.consoleMessages.filter(m => m.id !== targetId) };
                }
                return state;
            });
        }, 5000);
    },
    clearConsole: () => set({ consoleMessages: [] }),
});
