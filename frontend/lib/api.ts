import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from "axios";
import { createClient } from "@/lib/supabase/client";

// ── Axios Instance ──────────────────────────────────────────────────────────

const api: AxiosInstance = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
    timeout: 30000,
    headers: {
        "Content-Type": "application/json",
    },
});

// ── Auth Interceptor ────────────────────────────────────────────────────────

api.interceptors.request.use(
    async (config: InternalAxiosRequestConfig) => {
        try {
            const supabase = createClient();
            const {
                data: { session },
            } = await supabase.auth.getSession();

            if (session?.access_token) {
                config.headers.Authorization = `Bearer ${session.access_token}`;
            }
        } catch (error) {
            console.error("Failed to attach auth token:", error);
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// ── Response Interceptor ────────────────────────────────────────────────────

api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            // Token expired — redirect to login
            if (typeof window !== "undefined") {
                window.location.href = "/login";
            }
        }
        return Promise.reject(error);
    }
);

// ── API Methods ─────────────────────────────────────────────────────────────

/** Process a single onboarding voice step */
export async function processOnboardingStep(
    audioBlob: Blob,
    step: string,
    language: string = "en"
) {
    const formData = new FormData();
    formData.append("audio", audioBlob, "recording.webm");
    formData.append("step", step);
    formData.append("language", language);

    const response = await api.post("/api/v1/onboarding/process-step", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 60000,
    });
    return response.data;
}

/** Process a single onboarding step from typed text */
export async function processOnboardingTextStep(
    text: string,
    step: string,
) {
    const formData = new FormData();
    formData.append("text", text);
    formData.append("step", step);

    const response = await api.post("/api/v1/onboarding/process-text", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 60000,
    });
    return response.data;
}

/** Finalize onboarding and save to DB */
export async function finalizeOnboarding(data: {
    workspace: any;
    services: any[];
    inventory: any[];
}) {
    const response = await api.post("/api/v1/onboarding/finalize", data);
    return response.data;
}

/** Get TTS audio blob */
export async function getTTSAudio(text: string, languageCode: string = "en-US") {
    const response = await api.get("/api/v1/onboarding/tts", {
        params: { text, language_code: languageCode },
        responseType: "blob",
    });
    return response.data;
}

/** Get available booking slots (public) */
export async function getAvailableSlots(workspaceSlug: string, date?: string, serviceId?: string) {
    const params = new URLSearchParams();
    if (date) params.set("date", date);
    if (serviceId) params.set("service_id", serviceId);
    const response = await api.get(
        `/api/v1/bookings/public/slots/${workspaceSlug}?${params.toString()}`
    );
    return response.data;
}

/** Get business hours from the business_hours table */
export async function getBusinessHours() {
    const response = await api.get("/api/v1/bookings/business-hours");
    return response.data;
}

/** Update business hours in the business_hours table */
export async function updateBusinessHours(schedule: Record<string, { active: boolean; hours: { open: string; close: string }[] }>) {
    const response = await api.put("/api/v1/bookings/business-hours", { schedule });
    return response.data;
}

/** Create a new booking (authenticated) */
export async function createBooking(data: {
    contact_id: string;
    service_id?: string;
    starts_at: string;
    ends_at: string;
    notes?: string;
}) {
    const response = await api.post("/api/v1/bookings", data);
    return response.data;
}

/** Create a public booking (no auth — creates contact automatically) */
export async function createPublicBooking(
    workspaceSlug: string,
    data: {
        name: string;
        email: string;
        phone: string;
        starts_at: string;
        ends_at: string;
        service_id?: string;
        notes?: string;
    }
) {
    const response = await api.post(`/api/v1/bookings/public/${workspaceSlug}`, data);
    return response.data;
}

/** Get public services for a workspace (no auth) */
export async function getPublicServices(workspaceSlug: string) {
    const response = await api.get(`/api/v1/bookings/public/services/${workspaceSlug}`);
    return response.data;
}

/** ── Services ──────────────────────────────────────────────────────────── */

export async function listServices() {
    const response = await api.get("/api/v1/services");
    return response.data;
}

export async function createService(data: {
    name: string;
    duration_mins: number;
    price: number;
    currency?: string;
    description?: string;
}) {
    const response = await api.post("/api/v1/services", data);
    return response.data;
}

export async function updateService(serviceId: string, data: any) {
    const response = await api.patch(`/api/v1/services/${serviceId}`, data);
    return response.data;
}

export async function deleteService(serviceId: string) {
    await api.delete(`/api/v1/services/${serviceId}`);
}

/** ── Contacts ───────────────────────────────────────────────────────────── */

export async function searchContacts(query: string) {
    const response = await api.get("/api/v1/contacts", { params: { query } });
    return response.data;
}

export async function listContacts() {
    const response = await api.get("/api/v1/contacts");
    return response.data;
}

/** ── Inventory ──────────────────────────────────────────────────────────── */

export async function listInventory() {
    const response = await api.get("/api/v1/inventory");
    return response.data;
}

export async function createInventoryItem(data: {
    name: string;
    quantity: number;
    unit: string;
    low_stock_threshold: number;
    supplier_email?: string | null;
    sku?: string | null;
    supplier_phone?: string | null;
}) {
    const response = await api.post("/api/v1/inventory", data);
    return response.data;
}

export async function updateInventoryItem(itemId: string, data: {
    name?: string;
    quantity?: number;
    unit?: string;
    low_stock_threshold?: number;
    supplier_email?: string | null;
    sku?: string | null;
    supplier_phone?: string | null;
}) {
    const response = await api.patch(`/api/v1/inventory/${itemId}`, data);
    return response.data;
}



export async function deleteInventoryItem(itemId: string) {
    await api.delete(`/api/v1/inventory/${itemId}`);
}

export async function adjustInventory(itemId: string, adjustment: number, reason?: string) {
    const response = await api.patch(`/api/v1/inventory/${itemId}/adjust`, { adjustment, reason });
    return response.data;
}

/** ── Service-Inventory Linking ──────────────────────────────────────────── */

export async function getServiceInventory(serviceId: string) {
    const response = await api.get(`/api/v1/services/${serviceId}/inventory`);
    return response.data;
}

export async function setServiceInventory(serviceId: string, items: { item_id: string; qty_per_use: number }[]) {
    const response = await api.put(`/api/v1/services/${serviceId}/inventory`, items);
    return response.data;
}

/** ── Inventory Alerts & History ──────────────────────────────────────────── */

export async function listInventoryAlerts() {
    const response = await api.get("/api/v1/inventory/alerts");
    return response.data;
}

export async function resolveInventoryAlert(alertId: string) {
    const response = await api.patch(`/api/v1/inventory/alerts/${alertId}/resolve`);
    return response.data;
}

export async function getItemHistory(itemId: string) {
    const response = await api.get(`/api/v1/inventory/${itemId}/history`);
    return response.data;
}

/** Transition booking status */
export async function transitionBooking(
    bookingId: string,
    targetStatus: string,
    notes?: string
) {
    const response = await api.patch(`/api/v1/bookings/${bookingId}/transition`, {
        target_status: targetStatus,
        notes,
    });
    return response.data;
}

/** Get dashboard metrics */
export async function getDashboardMetrics() {
    const response = await api.get("/api/v1/dashboard/metrics");
    return response.data;
}

/** Get urgent action feed */
export async function getActionFeed() {
    const response = await api.get("/api/v1/dashboard/actions");
    return response.data;
}

/** Get AI-powered dashboard insights */
export async function getInsights() {
    const response = await api.get("/api/v1/dashboard/insights");
    return response.data;
}

/** List all conversations */
export async function listConversations() {
    const response = await api.get("/api/v1/inbox");
    return response.data;
}

/** Get conversation thread */
export async function getInboxThread(threadId: string) {
    const response = await api.get(`/api/v1/inbox/${threadId}`);
    return response.data;
}

/** Reply to a thread */
export async function replyToThread(threadId: string, body: string) {
    const response = await api.post(`/api/v1/inbox/${threadId}/reply`, { body });
    return response.data;
}

/** Mark all form submissions as read */
/** List all forms (definitions) in workspace */
export async function listForms() {
    const response = await api.get("/api/v1/forms");
    return response.data;
}

export async function markFormSubmissionsRead() {
    const response = await api.post("/api/v1/forms/submissions/mark-read");
    return response.data;
}

/** List all form submissions */
export async function listFormSubmissions() {
    const response = await api.get("/api/v1/forms/submissions");
    return response.data;
}


/** Get AI-suggested replies for a conversation thread */
export async function getSuggestedReplies(threadId: string): Promise<{ suggestions: string[]; detected_intent: string }> {
    const response = await api.post(`/api/v1/inbox/${threadId}/suggest-reply`);
    return response.data;
}

export async function getWhatsAppStatus(): Promise<{ state: string; qr: string | null }> {
    // This calls our bridge wrapper in Python which proxies to the Node service
    const response = await api.get("/api/v1/whatsapp/status");
    return response.data;
}

/** Trigger a fresh WhatsApp connection (clears stale session, generates new QR) */
export async function connectWhatsApp(): Promise<{ success: boolean; state: string; qr: string | null }> {
    const response = await api.post("/api/v1/whatsapp/connect");
    return response.data;
}


/** List all bookings */
export async function listBookings() {
    const response = await api.get("/api/v1/bookings");
    return response.data;
}

// ── Automation ──────────────────────────────────────────────────────────────

/** List automation rules */
export async function listAutomationRules() {
    const response = await api.get("/api/v1/automation/rules");
    return response.data;
}

/** Toggle automation rule */
export async function toggleAutomationRule(ruleId: string, isActive: boolean) {
    const response = await api.patch(`/api/v1/automation/rules/${ruleId}`, { is_active: isActive });
    return response.data;
}

/** Seed default automation rules */
export async function seedDefaultRules() {
    const response = await api.post("/api/v1/automation/seed-defaults");
    return response.data;
}

/** List automation logs */
export async function listAutomationLogs() {
    const response = await api.get("/api/v1/automation/logs");
    return response.data;
}

// ── Staff ───────────────────────────────────────────────────────────────────

/** List staff members */
export async function listStaff() {
    const response = await api.get("/api/v1/staff");
    return response.data;
}

/** Invite a staff member */
export async function inviteStaff(data: { email: string; full_name: string; role?: string }) {
    const response = await api.post("/api/v1/staff/invite", data);
    return response.data;
}

/** Remove a staff member */
export async function removeStaff(staffId: string) {
    const response = await api.delete(`/api/v1/staff/${staffId}`);
    return response.data;
}

/** Get integration connection status */
export async function getIntegrationStatus() {
    const response = await api.get("/api/v1/auth/integrations/status");
    return response.data;
}

/** Get Gmail OAuth connect URL */
export async function getGmailConnectUrl() {
    const response = await api.get("/api/v1/auth/gmail/connect");
    return response.data;
}

/** Get Google Calendar OAuth connect URL */
export async function getGcalConnectUrl() {
    const response = await api.get("/api/v1/auth/gcal/connect");
    return response.data;
}

/** Disconnect an integration */
export async function disconnectIntegration(provider: string) {
    const response = await api.delete(`/api/v1/auth/integrations/${provider}`);
    return response.data;
}

/** Health check */
export async function healthCheck() {
    // Add timestamp to bust any cache
    const response = await api.get(`/health?t=${Date.now()}`);
    return response.data;
}

export default api;
