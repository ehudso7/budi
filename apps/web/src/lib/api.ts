// Use relative URLs by default since API routes are on the same origin
// Only set NEXT_PUBLIC_API_URL if you need to point to a different backend
const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

// Token storage key - using sessionStorage for improved security
// SECURITY NOTE: For production, consider implementing httpOnly cookies via the backend
// to fully protect tokens from XSS attacks. sessionStorage is better than localStorage
// as it clears on tab close, but httpOnly cookies are the most secure option.
const TOKEN_STORAGE_KEY = "auth_token";

interface ApiError {
  message: string;
  code?: string;
  statusCode: number;
}

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setToken(token: string | null) {
    this.token = token;
    if (typeof window !== "undefined") {
      if (token) {
        // Using sessionStorage instead of localStorage for improved security
        // Session storage clears on tab close, limiting token exposure window
        sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
      } else {
        sessionStorage.removeItem(TOKEN_STORAGE_KEY);
        // Also clear any legacy localStorage tokens
        localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    }
  }

  getToken(): string | null {
    if (this.token) return this.token;
    if (typeof window !== "undefined") {
      // Check sessionStorage first, fall back to localStorage for migration
      this.token = sessionStorage.getItem(TOKEN_STORAGE_KEY) || localStorage.getItem(TOKEN_STORAGE_KEY);
      // Migrate localStorage token to sessionStorage
      if (this.token && localStorage.getItem(TOKEN_STORAGE_KEY)) {
        sessionStorage.setItem(TOKEN_STORAGE_KEY, this.token);
        localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    }
    return this.token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const token = this.getToken();

    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    if (token) {
      (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        message: "An unexpected error occurred",
        statusCode: response.status,
      }));
      throw error;
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: "GET" });
  }

  async post<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: "PUT",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async patch<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: "PATCH",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: "DELETE" });
  }

  async upload<T>(endpoint: string, formData: FormData): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const token = this.getToken();

    const headers: HeadersInit = {};
    if (token) {
      (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: formData,
    });

    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        message: "Upload failed",
        statusCode: response.status,
      }));
      throw error;
    }

    return response.json();
  }
}

export const api = new ApiClient(API_URL);

// Auth API
export const authApi = {
  register: (data: { email: string; password: string; name?: string }) =>
    api.post<{ user: User; token: string }>("/api/v1/auth/register", data),
  login: (data: { email: string; password: string }) =>
    api.post<{ user: User; token: string }>("/api/v1/auth/login", data),
  me: () => api.get<{ user: User }>("/api/v1/auth/me"),
  forgotPassword: (email: string) =>
    api.post("/api/v1/auth/forgot-password", { email }),
  resetPassword: (token: string, password: string) =>
    api.post("/api/v1/auth/reset-password", { token, password }),
};

// Projects API
export const projectsApi = {
  list: () => api.get<{ projects: Project[] }>("/api/v1/projects"),
  get: (id: string) => api.get<{ project: Project }>(`/api/v1/projects/${id}`),
  create: (data: { name: string; description?: string }) =>
    api.post<{ project: Project }>("/api/v1/projects", data),
  update: (id: string, data: { name?: string; description?: string }) =>
    api.patch<{ project: Project }>(`/api/v1/projects/${id}`, data),
  delete: (id: string) => api.delete(`/api/v1/projects/${id}`),
};

// Tracks API
export const tracksApi = {
  list: (projectId: string) =>
    api.get<{ tracks: Track[] }>(`/api/v1/projects/${projectId}/tracks`),
  get: (projectId: string, trackId: string) =>
    api.get<{ track: Track }>(`/api/v1/projects/${projectId}/tracks/${trackId}`),
  upload: (projectId: string, formData: FormData) =>
    api.upload<{ track: Track }>(`/api/v1/projects/${projectId}/tracks`, formData),
  delete: (projectId: string, trackId: string) =>
    api.delete(`/api/v1/projects/${projectId}/tracks/${trackId}`),
  analyze: (projectId: string, trackId: string) =>
    api.post<{ analysis: TrackAnalysis }>(
      `/api/v1/projects/${projectId}/tracks/${trackId}/analyze`
    ),
  fix: (projectId: string, trackId: string, options: FixOptions) =>
    api.post<{ job: ProcessingJob }>(
      `/api/v1/projects/${projectId}/tracks/${trackId}/fix`,
      options
    ),
  master: (projectId: string, trackId: string, options: MasterOptions) =>
    api.post<{ job: ProcessingJob }>(
      `/api/v1/projects/${projectId}/tracks/${trackId}/master`,
      options
    ),
  export: (projectId: string, trackId: string, options: ExportOptions) =>
    api.post<{ downloadUrl: string }>(
      `/api/v1/projects/${projectId}/tracks/${trackId}/export`,
      options
    ),
};

// Billing API
export const billingApi = {
  getSubscription: () =>
    api.get<{ subscription: Subscription | null }>("/api/v1/billing/subscription"),
  getPlans: () => api.get<{ plans: Plan[] }>("/api/v1/billing/plans"),
  createCheckout: (priceId: string) =>
    api.post<{ url: string }>("/api/v1/billing/checkout", { priceId }),
  createPortal: () =>
    api.post<{ url: string }>("/api/v1/billing/portal"),
  getUsage: () => api.get<{ usage: Usage }>("/api/v1/billing/usage"),
};

// Notifications API
export const notificationsApi = {
  list: () => api.get<{ notifications: Notification[] }>("/api/v1/notifications"),
  markRead: (id: string) =>
    api.patch(`/api/v1/notifications/${id}`, { read: true }),
  markAllRead: () => api.post("/api/v1/notifications/mark-all-read"),
};

// Types
export interface User {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
  subscription: {
    plan: string;
    status: string;
  } | null;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  trackCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Track {
  id: string;
  name: string;
  originalFileName: string;
  fileSize: number;
  duration: number;
  sampleRate: number;
  bitDepth: number;
  channels: number;
  format: string;
  waveformUrl: string | null;
  status: "pending" | "analyzing" | "ready" | "processing" | "error";
  analysis: TrackAnalysis | null;
  createdAt: string;
}

export interface TrackAnalysis {
  lufs: number;
  truePeak: number;
  dynamicRange: number;
  issues: Array<{
    type: string;
    severity: "low" | "medium" | "high";
    description: string;
    timestamp?: number;
  }>;
  spectralAnalysis: {
    lowEnd: number;
    midRange: number;
    highEnd: number;
  };
}

export interface FixOptions {
  removeClipping?: boolean;
  removeNoise?: boolean;
  fixPhase?: boolean;
  normalizeLevel?: boolean;
}

export interface MasterOptions {
  targetLufs?: number;
  genre?: string;
  referenceTrack?: string;
}

export interface ExportOptions {
  format: "wav" | "mp3" | "flac" | "aac";
  sampleRate?: number;
  bitDepth?: number;
  bitRate?: number;
}

export interface ProcessingJob {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  result?: {
    trackId: string;
    downloadUrl: string;
  };
  error?: string;
}

export interface Subscription {
  id: string;
  plan: string;
  status: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}

export interface Plan {
  id: string;
  name: string;
  price: number;
  interval: "month" | "year";
  features: string[];
  limits: {
    projects: number;
    tracksPerMonth: number;
    storageGb: number;
  };
}

export interface Usage {
  tracksProcessed: number;
  tracksLimit: number;
  storageUsed: number;
  storageLimit: number;
  periodEnd: string;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}
