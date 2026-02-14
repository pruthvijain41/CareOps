"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getTTSAudio, getGmailConnectUrl, getWhatsAppStatus } from "@/lib/api";
import api from "@/lib/api";
import { WakeupGate } from "@/components/auth/wakeup-screen";
import { QRCodeSVG } from "qrcode.react";
import {
    Mic,
    Send,
    Square,
    Loader2,
    Sparkles,
    ExternalLink,
    CheckCircle2,
    Clock,
    Briefcase,
    Mail,
    MessageSquare,
    ArrowRight,
    ShieldAlert,
    RefreshCw,
    AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────────

interface ChatMessage {
    role: "user" | "assistant";
    content: string;
    type?: "text" | "services" | "hours" | "gmail" | "whatsapp" | "done";
}

interface CollectedData {
    business_name: string | null;
    address: string | null;
    timezone: string | null;
    contact_email: string | null;
    services: Array<{ name: string; duration_mins: number; price: number }>;
    business_hours: Array<{ day: string; open: string; close: string }>;
    _phase: string;
}

const INITIAL_COLLECTED: CollectedData = {
    business_name: null,
    address: null,
    timezone: null,
    contact_email: null,
    services: [],
    business_hours: [],
    _phase: "collecting",
};

const GREETING =
    "Hey there! 👋 Welcome to CareOps. I'm here to get your workspace set up — it'll only take a minute. What's the name of your business?";

const PHASE_LABELS: Record<string, { label: string; icon: typeof Sparkles }> = {
    collecting: { label: "Basic Info", icon: Sparkles },
    services: { label: "Services", icon: Briefcase },
    hours: { label: "Business Hours", icon: Clock },
    gmail: { label: "Gmail", icon: Mail },
    whatsapp: { label: "WhatsApp", icon: MessageSquare },
    done: { label: "All Set", icon: CheckCircle2 },
};

const PHASE_ORDER = ["collecting", "services", "hours", "gmail", "whatsapp", "done"];

// ── Content Component ───────────────────────────────────────────────────────
function OnboardingContent() {
    const router = useRouter();
    const profile = useWorkspaceStore((s) => s.profile);
    const setProfile = useWorkspaceStore((s) => s.setProfile);

    const [messages, setMessages] = useState<ChatMessage[]>([
        { role: "assistant", content: GREETING },
    ]);
    const [collected, setCollected] = useState<CollectedData>({ ...INITIAL_COLLECTED });
    const [input, setInput] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const [phase, setPhase] = useState<string>("collecting");

    // Voice recording
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animFrameRef = useRef<number | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const [recordingSeconds, setRecordingSeconds] = useState(0);
    const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

    // TTS
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [isSpeaking, setIsSpeaking] = useState(false);

    // Auto-scroll
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Gmail check
    const [gmailConnected, setGmailConnected] = useState(false);
    const [workspaceProvisioned, setWorkspaceProvisioned] = useState(false);
    const workspaceSlugRef = useRef<string>("");

    // WhatsApp
    const [whatsappStatus, setWhatsappStatus] = useState<{ state: string; qr: string | null }>({
        state: "disconnected",
        qr: null,
    });
    const [whatsappConnected, setWhatsappConnected] = useState(false);
    const [whatsappLoading, setWhatsappLoading] = useState(false);
    const whatsappInitialCheckedRef = useRef(false);
    const whatsappWasAlreadyConnectedRef = useRef(false);

    // Scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Play TTS for the last assistant message
    const speakText = useCallback(async (text: string) => {
        try {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
            }
            setIsSpeaking(true);
            const blob = await getTTSAudio(text);
            const url = URL.createObjectURL(blob);
            if (audioRef.current) {
                audioRef.current.src = url;
                await audioRef.current.play();
            }
        } catch (err) {
            if (err instanceof Error && err.name === "AbortError") return;
            console.error("TTS failed:", err);
        }
    }, []);

    // Auto-play TTS for new assistant messages
    useEffect(() => {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg?.role === "assistant" && lastMsg.content) {
            speakText(lastMsg.content);
        }
    }, [messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── WhatsApp polling ─────────────────────────────────────────────────

    const fetchWhatsAppStatus = useCallback(async () => {
        setWhatsappLoading(true);
        try {
            const data = await getWhatsAppStatus();
            setWhatsappStatus(data);

            // On the very first check, record whether WhatsApp was already connected
            if (!whatsappInitialCheckedRef.current) {
                whatsappInitialCheckedRef.current = true;
                if (data.state === "connected") {
                    // Already connected from a previous session — don't treat as "just connected"
                    whatsappWasAlreadyConnectedRef.current = true;
                }
            } else if (data.state === "connected" && !whatsappWasAlreadyConnectedRef.current) {
                // Transitioned to connected during this onboarding session
                setWhatsappConnected(true);
            }
        } catch {
            // ignore
        } finally {
            setWhatsappLoading(false);
        }
    }, []);

    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (phase === "whatsapp" && !whatsappConnected) {
            // Reset initial check when entering whatsapp phase
            whatsappInitialCheckedRef.current = false;
            whatsappWasAlreadyConnectedRef.current = false;
            fetchWhatsAppStatus();
            interval = setInterval(fetchWhatsAppStatus, 5000);
        }
        return () => clearInterval(interval);
    }, [phase, whatsappConnected, fetchWhatsAppStatus]);

    // Auto-finalize when WhatsApp connects during onboarding
    useEffect(() => {
        if (whatsappConnected && phase === "whatsapp") {
            setPhase("done");
            setCollected((prev) => ({ ...prev, _phase: "done" }));
            const doneMsg: ChatMessage = {
                role: "assistant",
                content: "WhatsApp connected! 🎉 Setting up your workspace now...",
                type: "done",
            };
            setMessages((prev) => [...prev, doneMsg]);
            setTimeout(() => handleFinalize(collected), 2500);
        }
    }, [whatsappConnected]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Send text message ───────────────────────────────────────────────

    const sendMessage = async (userText: string) => {
        if (!userText.trim() || isProcessing) return;

        const userMsg: ChatMessage = { role: "user", content: userText };
        const updatedMessages = [...messages, userMsg];
        setMessages(updatedMessages);
        setInput("");
        setIsProcessing(true);

        try {
            const { data } = await api.post("/api/v1/onboarding/chat", {
                messages: updatedMessages.map((m) => ({
                    role: m.role,
                    content: m.content,
                })),
                collected: { ...collected, _phase: phase },
            });

            // Merge extracted fields
            const newCollected = { ...collected };
            if (data.extracted) {
                // Basic fields
                for (const key of ["business_name", "address", "timezone", "contact_email"] as const) {
                    if (data.extracted[key]) {
                        newCollected[key] = data.extracted[key];
                    }
                }
                // Services
                if (data.extracted.services?.length) {
                    newCollected.services = [...newCollected.services, ...data.extracted.services];
                }
                // Business hours
                if (data.extracted.business_hours?.length) {
                    newCollected.business_hours = [...newCollected.business_hours, ...data.extracted.business_hours];
                }
            }
            newCollected._phase = data.phase;
            setCollected(newCollected);

            // Determine message type based on new phase
            let msgType: ChatMessage["type"] = "text";
            if (data.phase === "gmail") msgType = "gmail";
            else if (data.phase === "whatsapp") msgType = "whatsapp";
            else if (data.phase === "done") msgType = "done";
            else if (data.phase === "services") msgType = "services";
            else if (data.phase === "hours") msgType = "hours";

            const assistantMsg: ChatMessage = {
                role: "assistant",
                content: data.reply,
                type: msgType,
            };
            setMessages((prev) => [...prev, assistantMsg]);
            setPhase(data.phase);

            // Auto-provision workspace when transitioning past collecting
            if (data.phase !== "collecting" && !workspaceProvisioned) {
                provisionWorkspace(newCollected);
            }

            // Auto-finalize when done
            if (data.phase === "done") {
                setTimeout(() => handleFinalize(newCollected), 2500);
            }
        } catch (err) {
            console.error("Chat failed:", err);
            const errorMsg: ChatMessage = {
                role: "assistant",
                content: "Oops, something went wrong on my end. Could you try again?",
            };
            setMessages((prev) => [...prev, errorMsg]);
        } finally {
            setIsProcessing(false);
        }
    };

    // ── Voice recording with silence detection ────────────────────────

    const SILENCE_THRESHOLD = 15;
    const SILENCE_DURATION = 1800;

    const cleanupRecording = useCallback(() => {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        silenceTimerRef.current = null;
        animFrameRef.current = null;
        recordingTimerRef.current = null;
        setRecordingSeconds(0);
    }, []);

    const startRecording = async () => {
        try {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
            }
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            const audioContext = new AudioContext();
            audioContextRef.current = audioContext;
            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 512;
            analyser.smoothingTimeConstant = 0.3;
            source.connect(analyser);
            analyserRef.current = analyser;

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            let silenceStart: number | null = null;
            let hasSpoken = false;

            const checkSilence = () => {
                analyser.getByteFrequencyData(dataArray);
                const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

                if (average > SILENCE_THRESHOLD) {
                    hasSpoken = true;
                    silenceStart = null;
                } else if (hasSpoken) {
                    if (!silenceStart) {
                        silenceStart = Date.now();
                    } else if (Date.now() - silenceStart > SILENCE_DURATION) {
                        stopRecording();
                        return;
                    }
                }
                animFrameRef.current = requestAnimationFrame(checkSilence);
            };

            mediaRecorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);

            mediaRecorder.onstop = async () => {
                cleanupRecording();
                if (audioContextRef.current) {
                    audioContextRef.current.close();
                    audioContextRef.current = null;
                }
                const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
                stream.getTracks().forEach((t) => t.stop());
                await sendVoiceMessage(audioBlob);
            };

            mediaRecorder.start();
            setIsRecording(true);
            setRecordingSeconds(0);

            recordingTimerRef.current = setInterval(() => {
                setRecordingSeconds((s) => s + 1);
            }, 1000);

            checkSilence();

            silenceTimerRef.current = setTimeout(() => {
                if (mediaRecorderRef.current?.state === "recording") {
                    stopRecording();
                }
            }, 30000);
        } catch (err) {
            console.error("Mic error:", err);
            toast.error("Could not access microphone");
        }
    };

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            cleanupRecording();
        }
    }, [cleanupRecording]);

    const sendVoiceMessage = async (audioBlob: Blob) => {
        setIsProcessing(true);

        const placeholderMsg: ChatMessage = { role: "user", content: "🎤 (speaking...)" };
        setMessages((prev) => [...prev, placeholderMsg]);

        try {
            const formData = new FormData();
            formData.append("audio", audioBlob, "recording.webm");
            formData.append(
                "messages",
                JSON.stringify(
                    messages.map((m) => ({ role: m.role, content: m.content }))
                )
            );
            formData.append("collected", JSON.stringify({ ...collected, _phase: phase }));

            const { data } = await api.post("/api/v1/onboarding/chat-voice", formData, {
                headers: { "Content-Type": "multipart/form-data" },
                timeout: 60000,
            });

            // Replace placeholder
            setMessages((prev) => {
                const newMsgs = [...prev];
                for (let i = newMsgs.length - 1; i >= 0; i--) {
                    if (newMsgs[i].content === "🎤 (speaking...)") {
                        newMsgs[i] = { role: "user", content: "(voice input)" };
                        break;
                    }
                }
                return newMsgs;
            });

            // Merge extracted
            const newCollected = { ...collected };
            if (data.extracted) {
                for (const key of ["business_name", "address", "timezone", "contact_email"] as const) {
                    if (data.extracted[key]) {
                        newCollected[key] = data.extracted[key];
                    }
                }
                if (data.extracted.services?.length) {
                    newCollected.services = [...newCollected.services, ...data.extracted.services];
                }
                if (data.extracted.business_hours?.length) {
                    newCollected.business_hours = [...newCollected.business_hours, ...data.extracted.business_hours];
                }
            }
            newCollected._phase = data.phase;
            setCollected(newCollected);

            let msgType: ChatMessage["type"] = "text";
            if (data.phase === "gmail") msgType = "gmail";
            else if (data.phase === "whatsapp") msgType = "whatsapp";
            else if (data.phase === "done") msgType = "done";
            else if (data.phase === "services") msgType = "services";
            else if (data.phase === "hours") msgType = "hours";

            const assistantMsg: ChatMessage = {
                role: "assistant",
                content: data.reply,
                type: msgType,
            };
            setMessages((prev) => [...prev, assistantMsg]);
            setPhase(data.phase);

            if (data.phase !== "collecting" && !workspaceProvisioned) {
                provisionWorkspace(newCollected);
            }

            if (data.phase === "done") {
                setTimeout(() => handleFinalize(newCollected), 2500);
            }
        } catch (err) {
            console.error("Voice chat failed:", err);
            const errorMsg: ChatMessage = {
                role: "assistant",
                content: "I couldn't process that. Could you try again?",
            };
            setMessages((prev) => [...prev, errorMsg]);
        } finally {
            setIsProcessing(false);
        }
    };

    // ── Workspace Provisioning ───────────────────────────────────────────

    const provisionWorkspace = async (currentCollected: CollectedData) => {
        try {
            const { data: result } = await api.post("/api/v1/onboarding/finalize", {
                business_name: currentCollected.business_name || "My Business",
                address: currentCollected.address || "",
                timezone: currentCollected.timezone || "UTC",
                contact_email: currentCollected.contact_email || "",
                services: [],
                business_hours: [],
            });

            workspaceSlugRef.current = result?.workspace_slug || "";
            setWorkspaceProvisioned(true);

            if (profile) {
                setProfile({
                    ...profile,
                    workspaceName: currentCollected.business_name || profile.workspaceName,
                    workspaceSlug: workspaceSlugRef.current || profile.workspaceSlug,
                });
            }
            console.log(`Workspace provisioned: ${workspaceSlugRef.current}`);
        } catch (err) {
            console.error("Workspace provisioning failed:", err);
        }
    };

    // ── Gmail Connect ────────────────────────────────────────────────────

    const handleGmailConnect = async () => {
        const gmailWindow = window.open("about:blank", "_blank");

        try {
            if (!workspaceProvisioned) {
                await provisionWorkspace(collected);
            }

            const data = await getGmailConnectUrl("onboarding");
            const authUrl = data.authorization_url || data.auth_url;
            if (authUrl && gmailWindow) {
                gmailWindow.location.href = authUrl;
                toast.info("Connect Gmail in the new tab, then come back here.");
                pollGmailStatus();
            } else if (!gmailWindow) {
                if (authUrl) {
                    toast.info("Opening Gmail connection...");
                    window.location.href = authUrl;
                }
            }
        } catch (err) {
            console.error("Gmail connect failed:", err);
            if (gmailWindow) gmailWindow.close();
            toast.error("Gmail connection failed. Try again or skip for now.");
        }
    };

    const pollGmailStatus = () => {
        const interval = setInterval(async () => {
            try {
                const { data } = await api.get("/api/v1/auth/integrations/status");
                if (data?.gmail?.connected) {
                    clearInterval(interval);
                    setGmailConnected(true);

                    const doneMsg: ChatMessage = {
                        role: "assistant",
                        content: "Gmail connected! 🎉 Great, now let's connect your WhatsApp too — or you can skip this step.",
                        type: "whatsapp",
                    };
                    setMessages((prev) => [...prev, doneMsg]);
                    setPhase("whatsapp");
                    setCollected((prev) => ({ ...prev, _phase: "whatsapp" }));
                }
            } catch {
                // Keep polling
            }
        }, 3000);

        setTimeout(() => clearInterval(interval), 120000);
    };

    const skipGmail = () => {
        setPhase("whatsapp");
        setCollected((prev) => ({ ...prev, _phase: "whatsapp" }));
        const skipMsg: ChatMessage = {
            role: "assistant",
            content: "No problem! You can connect Gmail later from Settings. Let's see about WhatsApp — or you can skip this too.",
            type: "whatsapp",
        };
        setMessages((prev) => [...prev, skipMsg]);
    };

    const skipWhatsApp = () => {
        setPhase("done");
        setCollected((prev) => ({ ...prev, _phase: "done" }));
        const skipMsg: ChatMessage = {
            role: "assistant",
            content: "All good! You can connect WhatsApp later from Settings. Let me set up your workspace now! 🚀",
            type: "done",
        };
        setMessages((prev) => [...prev, skipMsg]);
        setTimeout(() => handleFinalize(collected), 2000);
    };

    // ── Finalize ─────────────────────────────────────────────────────────

    const handleFinalize = async (finalCollected?: CollectedData) => {
        const c = finalCollected || collected;
        setIsProcessing(true);
        try {
            const { data: result } = await api.post("/api/v1/onboarding/finalize", {
                business_name: c.business_name || "My Business",
                address: c.address || "",
                timezone: c.timezone || "UTC",
                contact_email: c.contact_email || "",
                services: c.services || [],
                business_hours: c.business_hours || [],
            });

            const slug = result?.workspace_slug || workspaceSlugRef.current || profile?.workspaceSlug;

            try {
                await api.post("/api/v1/automation/seed-defaults");
            } catch {
                // Non-critical
            }

            if (profile && slug) {
                setProfile({
                    ...profile,
                    workspaceName: c.business_name || profile.workspaceName,
                    workspaceSlug: slug,
                });
            }

            toast.success("Your workspace is ready!");
            router.push(slug ? `/${slug}` : "/login");
        } catch (err) {
            console.error("Finalize failed:", err);
            toast.error("Something went wrong. Please try again.");
        } finally {
            setIsProcessing(false);
        }
    };

    // ── Progress helpers ─────────────────────────────────────────────────

    const currentPhaseIndex = PHASE_ORDER.indexOf(phase);

    // ── Render ───────────────────────────────────────────────────────────

    return (
        <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center relative overflow-hidden">
            {/* Background pattern */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
                <div className="absolute inset-0 bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:24px_24px]" />
            </div>

            <div className="w-full max-w-2xl z-10 flex flex-col h-screen sm:h-[92vh] sm:max-h-[800px] sm:my-auto bg-white rounded-none sm:rounded-[2rem] border-0 sm:border border-slate-200 shadow-none sm:shadow-[0_32px_64px_-16px_rgba(0,0,0,0.08)] overflow-hidden">
                {/* ── Header ───────────────────────────────────── */}
                <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between shrink-0 bg-white">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center">
                            <Sparkles className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <span className="font-display font-bold text-slate-900 text-sm tracking-tight">
                                CareOps
                            </span>
                            <p className="text-[10px] text-slate-400 font-medium tracking-wide">
                                Workspace Setup
                            </p>
                        </div>
                    </div>

                    {/* Phase indicator */}
                    <div className="flex items-center gap-1.5">
                        {PHASE_ORDER.map((p, i) => {
                            const isCompleted = i < currentPhaseIndex;
                            const isCurrent = i === currentPhaseIndex;
                            return (
                                <div
                                    key={p}
                                    className={cn(
                                        "h-1.5 rounded-full transition-all duration-500",
                                        isCurrent ? "w-6 bg-slate-900" : isCompleted ? "w-3 bg-emerald-400" : "w-3 bg-slate-200"
                                    )}
                                    title={PHASE_LABELS[p]?.label}
                                />
                            );
                        })}
                    </div>
                </div>

                {/* Current phase label */}
                <div className="px-6 py-2.5 border-b border-slate-50 bg-slate-50/50 shrink-0">
                    <div className="flex items-center gap-2">
                        {(() => {
                            const PhaseIcon = PHASE_LABELS[phase]?.icon || Sparkles;
                            return <PhaseIcon className="w-3.5 h-3.5 text-slate-400" />;
                        })()}
                        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
                            {PHASE_LABELS[phase]?.label || "Setup"}
                        </span>
                    </div>
                </div>

                {/* ── Messages ─────────────────────────────────── */}
                <div
                    ref={scrollContainerRef}
                    className="flex-1 overflow-y-auto px-6 py-5 space-y-4"
                >
                    {messages.map((msg, i) => (
                        <div
                            key={i}
                            className={cn(
                                "flex animate-in fade-in slide-in-from-bottom-2 duration-300",
                                msg.role === "user" ? "justify-end" : "justify-start"
                            )}
                            style={{ animationDelay: `${i * 30}ms` }}
                        >
                            <div
                                className={cn(
                                    "max-w-[85%] px-5 py-3.5 text-[13px] leading-relaxed",
                                    msg.role === "user"
                                        ? "bg-slate-900 text-white rounded-2xl rounded-br-md shadow-lg shadow-slate-200/50"
                                        : "bg-slate-50 border border-slate-100 text-slate-700 rounded-2xl rounded-bl-md"
                                )}
                            >
                                <span className="font-medium">{msg.content}</span>

                                {/* ── Services collected display ────────────── */}
                                {msg.type === "services" && collected.services.length > 0 && (
                                    <div className="mt-3 space-y-2">
                                        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
                                            Services added
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {collected.services.map((svc, si) => (
                                                <span
                                                    key={si}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-[11px] font-semibold text-slate-700 shadow-sm"
                                                >
                                                    <Briefcase className="w-3 h-3 text-emerald-500" />
                                                    {svc.name}
                                                    {svc.price > 0 && (
                                                        <span className="text-slate-400 ml-1">₹{svc.price}</span>
                                                    )}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* ── Business hours collected display ────────── */}
                                {msg.type === "hours" && collected.business_hours.length > 0 && (
                                    <div className="mt-3 space-y-2">
                                        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
                                            Hours set
                                        </p>
                                        <div className="grid grid-cols-1 gap-1">
                                            {collected.business_hours.map((h, hi) => (
                                                <div
                                                    key={hi}
                                                    className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-[11px] font-medium"
                                                >
                                                    <span className="text-slate-700">{h.day}</span>
                                                    <span className="text-slate-400">{h.open} – {h.close}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* ── Gmail connect with guidelines ────────────── */}
                                {msg.type === "gmail" && !gmailConnected && (
                                    <div className="mt-4 space-y-3">
                                        {/* Guidelines */}
                                        <div className="rounded-xl bg-amber-50 border border-amber-100 p-4 space-y-3">
                                            <div className="flex items-center gap-2">
                                                <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
                                                <span className="text-[11px] font-bold text-amber-700">
                                                    Important: Follow these steps
                                                </span>
                                            </div>
                                            <ol className="text-[11px] text-amber-700 space-y-2 leading-relaxed font-medium">
                                                <li className="flex gap-2">
                                                    <span className="flex-shrink-0 w-4 h-4 rounded-full bg-amber-100 text-[9px] font-bold flex items-center justify-center text-amber-600">1</span>
                                                    <span>Click <strong>"Connect Gmail"</strong> — a new tab will open</span>
                                                </li>
                                                <li className="flex gap-2">
                                                    <span className="flex-shrink-0 w-4 h-4 rounded-full bg-amber-100 text-[9px] font-bold flex items-center justify-center text-amber-600">2</span>
                                                    <span>You&apos;ll see <strong>&quot;Google hasn&apos;t verified this app&quot;</strong> — click <strong>Advanced</strong></span>
                                                </li>
                                                <li className="flex gap-2">
                                                    <span className="flex-shrink-0 w-4 h-4 rounded-full bg-amber-100 text-[9px] font-bold flex items-center justify-center text-amber-600">3</span>
                                                    <span>Click <strong>&quot;Go to CareOps (unsafe)&quot;</strong></span>
                                                </li>
                                                <li className="flex gap-2">
                                                    <span className="flex-shrink-0 w-4 h-4 rounded-full bg-amber-100 text-[9px] font-bold flex items-center justify-center text-amber-600">4</span>
                                                    <span>Click <strong>Continue</strong></span>
                                                </li>
                                                <li className="flex gap-2">
                                                    <span className="flex-shrink-0 w-4 h-4 rounded-full bg-amber-100 text-[9px] font-bold flex items-center justify-center text-amber-600">5</span>
                                                    <span>Select <strong>all permissions</strong> asked and click <strong>Allow</strong></span>
                                                </li>
                                                <li className="flex gap-2">
                                                    <span className="flex-shrink-0 w-4 h-4 rounded-full bg-amber-100 text-[9px] font-bold flex items-center justify-center text-amber-600">6</span>
                                                    <span>Come back to this tab</span>
                                                </li>
                                            </ol>
                                        </div>

                                        <Button
                                            onClick={handleGmailConnect}
                                            className="w-full rounded-xl bg-slate-900 text-white hover:bg-slate-800 h-11 gap-2 font-semibold text-[13px] shadow-lg shadow-slate-200/50"
                                        >
                                            <Mail className="w-4 h-4" />
                                            Connect Gmail
                                        </Button>
                                        <button
                                            onClick={skipGmail}
                                            className="w-full text-center text-[11px] text-slate-400 font-medium hover:text-slate-600 transition-colors py-1"
                                        >
                                            Skip for now — set up later in Settings →
                                        </button>
                                    </div>
                                )}

                                {msg.type === "gmail" && gmailConnected && (
                                    <div className="mt-3 flex items-center gap-2 text-emerald-600 text-[12px] font-semibold">
                                        <CheckCircle2 className="w-4 h-4" />
                                        Gmail Connected
                                    </div>
                                )}

                                {/* ── WhatsApp connect with QR ────────────────── */}
                                {msg.type === "whatsapp" && !whatsappConnected && (
                                    <div className="mt-4 space-y-3">
                                        <div className="flex flex-col items-center py-2">
                                            {whatsappStatus.qr ? (
                                                <div className="space-y-4">
                                                    <div className="p-4 bg-white border-2 border-slate-100 rounded-2xl shadow-sm mx-auto w-fit">
                                                        <QRCodeSVG value={whatsappStatus.qr} size={180} />
                                                    </div>
                                                    <ol className="text-[11px] text-slate-500 space-y-2 font-medium">
                                                        <li className="flex gap-2">
                                                            <span className="flex-shrink-0 w-4 h-4 rounded-full bg-slate-100 text-[9px] font-bold flex items-center justify-center text-slate-500">1</span>
                                                            <span>Open WhatsApp on your phone</span>
                                                        </li>
                                                        <li className="flex gap-2">
                                                            <span className="flex-shrink-0 w-4 h-4 rounded-full bg-slate-100 text-[9px] font-bold flex items-center justify-center text-slate-500">2</span>
                                                            <span>Go to Settings → Linked Devices</span>
                                                        </li>
                                                        <li className="flex gap-2">
                                                            <span className="flex-shrink-0 w-4 h-4 rounded-full bg-slate-100 text-[9px] font-bold flex items-center justify-center text-slate-500">3</span>
                                                            <span>Scan this QR code with your phone</span>
                                                        </li>
                                                    </ol>
                                                    <button
                                                        onClick={fetchWhatsAppStatus}
                                                        disabled={whatsappLoading}
                                                        className="flex items-center gap-1.5 mx-auto text-[11px] text-slate-400 hover:text-slate-600 font-medium transition-colors"
                                                    >
                                                        <RefreshCw className={cn("w-3 h-3", whatsappLoading && "animate-spin")} />
                                                        Refresh QR
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center py-4">
                                                    <Loader2 className="w-6 h-6 text-slate-300 animate-spin mb-2" />
                                                    <p className="text-[11px] text-slate-400 font-medium">Loading QR code...</p>
                                                </div>
                                            )}
                                        </div>

                                        <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 flex gap-2.5">
                                            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                            <p className="text-[10px] text-amber-700 leading-relaxed font-medium">
                                                This links your WhatsApp via an unofficial bridge. CareOps will be able to read and send messages from your inbox.
                                            </p>
                                        </div>

                                        <button
                                            onClick={skipWhatsApp}
                                            className="w-full text-center text-[11px] text-slate-400 font-medium hover:text-slate-600 transition-colors py-1"
                                        >
                                            Skip for now — set up later in Settings →
                                        </button>
                                    </div>
                                )}

                                {msg.type === "whatsapp" && whatsappConnected && (
                                    <div className="mt-3 flex items-center gap-2 text-emerald-600 text-[12px] font-semibold">
                                        <CheckCircle2 className="w-4 h-4" />
                                        WhatsApp Connected
                                    </div>
                                )}

                                {/* ── Done state ───────────────────────────────── */}
                                {msg.type === "done" && (
                                    <div className="mt-4 space-y-3">
                                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                            <div className="h-full bg-emerald-500 rounded-full animate-pulse w-full" />
                                        </div>
                                        <p className="text-[11px] text-slate-400 font-medium text-center">
                                            Setting up your workspace...
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}

                    {/* Typing indicator */}
                    {isProcessing && (
                        <div className="flex justify-start animate-in fade-in duration-200">
                            <div className="bg-slate-50 border border-slate-100 rounded-2xl rounded-bl-md px-5 py-3.5 flex items-center gap-2">
                                <div className="flex gap-1">
                                    <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0ms]" />
                                    <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:150ms]" />
                                    <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:300ms]" />
                                </div>
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* ── Collected summary ───────────────────────── */}
                {(collected.business_name || collected.services.length > 0) && (
                    <div className="border-t border-slate-100 px-6 py-2.5 flex flex-wrap gap-2 shrink-0 bg-slate-50/50">
                        {collected.business_name && (
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] bg-slate-900 text-white px-2.5 py-1 rounded-lg">
                                {collected.business_name}
                            </span>
                        )}
                        {collected.address && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-wide text-slate-500 bg-white border border-slate-200 px-2.5 py-1 rounded-lg">
                                📍 {collected.address}
                            </span>
                        )}
                        {collected.timezone && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-wide text-slate-500 bg-white border border-slate-200 px-2.5 py-1 rounded-lg">
                                🕐 {collected.timezone}
                            </span>
                        )}
                        {collected.contact_email && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-wide text-slate-500 bg-white border border-slate-200 px-2.5 py-1 rounded-lg">
                                ✉️ {collected.contact_email}
                            </span>
                        )}
                        {collected.services.length > 0 && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-wide text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-lg">
                                <Briefcase className="w-3 h-3" />
                                {collected.services.length} service{collected.services.length > 1 ? "s" : ""}
                            </span>
                        )}
                        {collected.business_hours.length > 0 && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-wide text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-lg">
                                <Clock className="w-3 h-3" />
                                {collected.business_hours.length} day{collected.business_hours.length > 1 ? "s" : ""}
                            </span>
                        )}
                    </div>
                )}

                {/* ── Input bar ─────────────────────────────────── */}
                <div className="border-t border-slate-100 p-4 shrink-0 bg-white">
                    {isRecording ? (
                        <div className="flex items-center gap-3">
                            <button
                                onClick={stopRecording}
                                className="shrink-0 w-10 h-10 flex items-center justify-center bg-red-500 text-white rounded-xl animate-pulse transition-all shadow-lg shadow-red-200"
                            >
                                <Square className="w-4 h-4 fill-current" />
                            </button>
                            <div className="flex-1 flex flex-col gap-0.5">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                                    <span className="text-[13px] font-semibold text-red-600">
                                        Listening... {recordingSeconds}s
                                    </span>
                                </div>
                                <span className="text-[10px] text-slate-400 font-medium">
                                    Auto-stops when you pause speaking
                                </span>
                            </div>
                            <button
                                onClick={stopRecording}
                                className="text-[11px] text-slate-500 font-semibold hover:text-slate-700 transition-colors px-3 py-1.5 border border-slate-200 rounded-lg"
                            >
                                Send now ↵
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={startRecording}
                                disabled={isProcessing || phase === "done"}
                                className="rounded-xl h-10 w-10 shrink-0 border-slate-200 hover:bg-slate-50"
                            >
                                <Mic className="w-4 h-4 text-slate-500" />
                            </Button>

                            <Input
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        sendMessage(input);
                                    }
                                }}
                                placeholder={
                                    phase === "gmail"
                                        ? "Connect Gmail above, or type to continue..."
                                        : phase === "whatsapp"
                                            ? "Scan the QR code above, or type to continue..."
                                            : "Type your message..."
                                }
                                disabled={isProcessing || phase === "done"}
                                className="rounded-xl text-[13px] h-10 flex-1 border-slate-200 bg-slate-50/50 font-medium focus:ring-slate-900 focus:ring-1 focus:border-slate-900"
                            />

                            <Button
                                variant="default"
                                size="icon"
                                onClick={() => sendMessage(input)}
                                disabled={!input.trim() || isProcessing || phase === "done"}
                                className="rounded-xl h-10 w-10 shrink-0 bg-slate-900 hover:bg-slate-800 shadow-lg shadow-slate-200/50"
                            >
                                {isProcessing ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Send className="w-4 h-4" />
                                )}
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            {/* Hidden audio element for TTS */}
            <audio
                ref={audioRef}
                onEnded={() => setIsSpeaking(false)}
                onError={() => setIsSpeaking(false)}
                className="hidden"
            />
        </div>
    );
}

export default function OnboardingPage() {
    return (
        <WakeupGate>
            <OnboardingContent />
        </WakeupGate>
    );
}
