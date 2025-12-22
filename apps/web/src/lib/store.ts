import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User, Project, Track, Notification } from "./api";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (_user: User | null) => void;
  setLoading: (_loading: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      setUser: (user) =>
        set({ user, isAuthenticated: !!user, isLoading: false }),
      setLoading: (isLoading) => set({ isLoading }),
      logout: () => {
        localStorage.removeItem("auth_token");
        set({ user: null, isAuthenticated: false, isLoading: false });
      },
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({ user: state.user }),
    }
  )
);

interface ProjectState {
  projects: Project[];
  currentProject: Project | null;
  setProjects: (_projects: Project[]) => void;
  setCurrentProject: (_project: Project | null) => void;
  addProject: (_project: Project) => void;
  updateProject: (_id: string, _data: Partial<Project>) => void;
  removeProject: (_id: string) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  currentProject: null,
  setProjects: (projects) => set({ projects }),
  setCurrentProject: (currentProject) => set({ currentProject }),
  addProject: (project) =>
    set((state) => ({ projects: [project, ...state.projects] })),
  updateProject: (id, data) =>
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === id ? { ...p, ...data } : p
      ),
      currentProject:
        state.currentProject?.id === id
          ? { ...state.currentProject, ...data }
          : state.currentProject,
    })),
  removeProject: (id) =>
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      currentProject:
        state.currentProject?.id === id ? null : state.currentProject,
    })),
}));

interface TrackState {
  tracks: Track[];
  currentTrack: Track | null;
  setTracks: (_tracks: Track[]) => void;
  setCurrentTrack: (_track: Track | null) => void;
  addTrack: (_track: Track) => void;
  updateTrack: (_id: string, _data: Partial<Track>) => void;
  removeTrack: (_id: string) => void;
}

export const useTrackStore = create<TrackState>((set) => ({
  tracks: [],
  currentTrack: null,
  setTracks: (tracks) => set({ tracks }),
  setCurrentTrack: (currentTrack) => set({ currentTrack }),
  addTrack: (track) => set((state) => ({ tracks: [...state.tracks, track] })),
  updateTrack: (id, data) =>
    set((state) => ({
      tracks: state.tracks.map((t) => (t.id === id ? { ...t, ...data } : t)),
      currentTrack:
        state.currentTrack?.id === id
          ? { ...state.currentTrack, ...data }
          : state.currentTrack,
    })),
  removeTrack: (id) =>
    set((state) => ({
      tracks: state.tracks.filter((t) => t.id !== id),
      currentTrack: state.currentTrack?.id === id ? null : state.currentTrack,
    })),
}));

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  setNotifications: (_notifications: Notification[]) => void;
  addNotification: (_notification: Notification) => void;
  markAsRead: (_id: string) => void;
  markAllAsRead: () => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,
  setNotifications: (notifications) =>
    set({
      notifications,
      unreadCount: notifications.filter((n) => !n.read).length,
    }),
  addNotification: (notification) =>
    set((state) => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + (notification.read ? 0 : 1),
    })),
  markAsRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    })),
  markAllAsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })),
}));

interface UIState {
  sidebarOpen: boolean;
  theme: "light" | "dark" | "system";
  setSidebarOpen: (_open: boolean) => void;
  toggleSidebar: () => void;
  setTheme: (_theme: "light" | "dark" | "system") => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      theme: "system",
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      toggleSidebar: () =>
        set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: "ui-storage",
    }
  )
);
