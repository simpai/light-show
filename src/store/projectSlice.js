import { ProjectState } from '../core/ProjectState';

export const createProjectSlice = (set, get) => ({
    project: new ProjectState(),
    layoutData: null,
    gridLayoutData: null,
    matrixConfig: { cols: 63, rows: 16 },

    // Actions
    setProject: (newProject) => set({ project: typeof newProject === 'function' ? newProject(get().project) : newProject }),
    setLayoutData: (data) => set({ layoutData: typeof data === 'function' ? data(get().layoutData) : data }),
    setGridLayoutData: (data) => set({ gridLayoutData: typeof data === 'function' ? data(get().gridLayoutData) : data }),
    setMatrixConfig: (config) => set({ matrixConfig: typeof config === 'function' ? config(get().matrixConfig) : config }),
});
