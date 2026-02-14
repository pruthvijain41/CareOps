import { create } from "zustand";

// ── Types ───────────────────────────────────────────────────────────────────

export type OnboardingStep =
    | "welcome"
    | "recording"
    | "processing"
    | "review"
    | "complete";

export interface ParsedConfig {
    business_name?: string;
    services?: Array<{
        name: string;
        description?: string;
        duration_mins?: number;
        price?: number;
    }>;
    business_hours?: Array<{
        day: string;
        open: string;
        close: string;
    }>;
    contact_info?: {
        email?: string;
        phone?: string;
        address?: string;
    };
    [key: string]: unknown;
}

export interface RecordingEntry {
    blob: Blob;
    transcript: string;
    config: ParsedConfig;
    confidence: number;
    followUpQuestions: string[];
    timestamp: number;
}

interface OnboardingState {
    /** Current wizard step */
    currentStep: OnboardingStep;

    /** All recording entries from the voice sessions */
    recordings: RecordingEntry[];

    /** Merged final config (aggregated from all recordings) */
    mergedConfig: ParsedConfig;

    /** Current audio blob being recorded */
    currentBlob: Blob | null;

    /** Processing status */
    isProcessing: boolean;
    error: string | null;

    /** Actions */
    setStep: (step: OnboardingStep) => void;
    setCurrentBlob: (blob: Blob | null) => void;
    addRecording: (entry: RecordingEntry) => void;
    updateMergedConfig: (config: ParsedConfig) => void;
    setProcessing: (processing: boolean) => void;
    setError: (error: string | null) => void;
    reset: () => void;
}

// ── Store ───────────────────────────────────────────────────────────────────

const initialState = {
    currentStep: "welcome" as OnboardingStep,
    recordings: [] as RecordingEntry[],
    mergedConfig: {} as ParsedConfig,
    currentBlob: null as Blob | null,
    isProcessing: false,
    error: null as string | null,
};

export const useOnboardingStore = create<OnboardingState>()((set, get) => ({
    ...initialState,

    setStep: (step) => set({ currentStep: step }),

    setCurrentBlob: (blob) => set({ currentBlob: blob }),

    addRecording: (entry) => {
        const recordings = [...get().recordings, entry];

        // Merge configs from all recordings
        const merged: ParsedConfig = {};
        for (const rec of recordings) {
            if (rec.config.business_name) merged.business_name = rec.config.business_name;
            if (rec.config.services?.length) {
                merged.services = [...(merged.services ?? []), ...rec.config.services];
            }
            if (rec.config.business_hours?.length) {
                merged.business_hours = rec.config.business_hours;
            }
            if (rec.config.contact_info) {
                merged.contact_info = { ...merged.contact_info, ...rec.config.contact_info };
            }
        }

        set({ recordings, mergedConfig: merged });
    },

    updateMergedConfig: (config) =>
        set({ mergedConfig: { ...get().mergedConfig, ...config } }),

    setProcessing: (processing) => set({ isProcessing: processing }),
    setError: (error) => set({ error }),

    reset: () => set(initialState),
}));
