import { create } from "zustand";
import { persist } from "zustand/middleware";

// ── Types ───────────────────────────────────────────────────────────────────

export type UserRole = "owner" | "staff";

export interface Permissions {
    inbox: boolean;
    leads: boolean;
    bookings: boolean;
    forms: boolean;
    inventory: boolean;
    reports: boolean;
}

export interface WorkspaceProfile {
    id: string;
    workspaceId: string;
    workspaceName: string;
    workspaceSlug: string;
    role: UserRole;
    fullName: string | null;
    avatarUrl: string | null;
    email: string | null;
    permissions: Permissions;
}

interface WorkspaceState {
    /** Current workspace context */
    profile: WorkspaceProfile | null;
    isLoading: boolean;

    /** Actions */
    setProfile: (profile: WorkspaceProfile) => void;
    clearProfile: () => void;
    setLoading: (loading: boolean) => void;

    /** Computed */
    isOwner: () => boolean;
    workspaceSlug: () => string | null;
    hasPermission: (key: keyof Permissions) => boolean;
}

// ── Store ───────────────────────────────────────────────────────────────────

export const useWorkspaceStore = create<WorkspaceState>()(
    persist(
        (set, get) => ({
            profile: null,
            isLoading: true,

            setProfile: (profile) => set({ profile, isLoading: false }),
            clearProfile: () => set({ profile: null, isLoading: false }),
            setLoading: (loading) => set({ isLoading: loading }),

            isOwner: () => get().profile?.role === "owner",
            workspaceSlug: () => get().profile?.workspaceSlug ?? null,
            hasPermission: (key) => {
                const p = get().profile;
                if (!p) return false;
                if (p.role === "owner") return true; // Owner has all permissions
                return p.permissions?.[key] ?? false;
            },
        }),
        {
            name: "careops-workspace",
            partialize: (state) => ({ profile: state.profile }),
        }
    )
);
