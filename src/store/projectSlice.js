import { ProjectState } from '../core/ProjectState';

export const createProjectSlice = (set, get) => ({
    project: new ProjectState(),
    layoutData: null,
    gridLayoutData: null,
    matrixConfig: JSON.parse(localStorage.getItem('ls_editor_matrix_config')) || { cols: 63, rows: 16 },

    // Actions
    setProject: (newProject) => set({ project: typeof newProject === 'function' ? newProject(get().project) : newProject }),
    setLayoutData: (data) => set({ layoutData: typeof data === 'function' ? data(get().layoutData) : data }),
    setGridLayoutData: (data) => set({ gridLayoutData: typeof data === 'function' ? data(get().gridLayoutData) : data }),
    setMatrixConfig: (config) => {
        const newConfig = typeof config === 'function' ? config(get().matrixConfig) : config;
        localStorage.setItem('ls_editor_matrix_config', JSON.stringify(newConfig));
        set({ matrixConfig: newConfig });
    },
});
