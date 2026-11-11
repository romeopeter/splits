/**
 * The project store, with undo and redo.
 *
 * - `commit(fn)` applies an edit and records the previous project for undo.
 * - Drags call `beginGesture()`, then `live(fn)` on every pointer move, then
 *   `endGesture()`: the whole drag becomes one undo step.
 * - `patchAsset` updates background-job results (proxy ready, thumbnails,
 *   peaks) in the current project *and* every history snapshot, so undo never
 *   resurrects a stale "proxy pending" state.
 */
import { create } from "zustand";
import type { Asset, Project } from "../types/project";
import { createProject, normalizeProject } from "../lib/timeline";

const HISTORY_LIMIT = 100;

interface ProjectState {
  project: Project;
  past: Project[];
  future: Project[];
  gestureStart: Project | null;
  /** Bumped on every change; autosave watches it. */
  revision: number;
  commit: (fn: (p: Project) => Project) => void;
  beginGesture: () => void;
  live: (fn: (p: Project) => Project) => void;
  endGesture: () => void;
  cancelGesture: () => void;
  patchAsset: (id: string, patch: Partial<Asset>) => void;
  undo: () => void;
  redo: () => void;
  load: (p: Project) => void;
}

const stamp = (p: Project): Project => ({ ...p, updatedAt: new Date().toISOString() });

export const useProject = create<ProjectState>((set, get) => ({
  project: createProject(),
  past: [],
  future: [],
  gestureStart: null,
  revision: 0,

  commit(fn) {
    const { project, past, revision } = get();
    const next = fn(project);
    if (next === project) return;
    set({ project: stamp(next), past: [...past, project].slice(-HISTORY_LIMIT), future: [], revision: revision + 1 });
  },

  beginGesture() {
    set({ gestureStart: get().project });
  },

  live(fn) {
    const { project } = get();
    const next = fn(project);
    if (next !== project) set({ project: next });
  },

  endGesture() {
    const { gestureStart, project, past, revision } = get();
    if (!gestureStart) return;
    if (gestureStart === project) {
      set({ gestureStart: null });
      return;
    }
    set({
      gestureStart: null,
      project: stamp(project),
      past: [...past, gestureStart].slice(-HISTORY_LIMIT),
      future: [],
      revision: revision + 1,
    });
  },

  cancelGesture() {
    const { gestureStart } = get();
    if (gestureStart) set({ project: gestureStart, gestureStart: null });
  },

  patchAsset(id, patch) {
    const apply = (p: Project): Project => {
      const a = p.assets[id];
      return a ? { ...p, assets: { ...p.assets, [id]: { ...a, ...patch, id } } } : p;
    };
    const { project, past, future, revision } = get();
    set({ project: apply(project), past: past.map(apply), future: future.map(apply), revision: revision + 1 });
  },

  undo() {
    const { past, project, future, revision } = get();
    const prev = past[past.length - 1];
    if (!prev) return;
    set({ project: prev, past: past.slice(0, -1), future: [project, ...future], revision: revision + 1 });
  },

  redo() {
    const { past, project, future, revision } = get();
    const next = future[0];
    if (!next) return;
    set({ project: next, past: [...past, project], future: future.slice(1), revision: revision + 1 });
  },

  load(p) {
    set({ project: normalizeProject(p), past: [], future: [], gestureStart: null, revision: get().revision + 1 });
  },
}));

export const getProject = () => useProject.getState().project;
