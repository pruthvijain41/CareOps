"use client";

import { useState, useEffect, useRef } from "react";
import { getWhatsAppStatus, connectWhatsApp } from "@/lib/api";
import { QRCodeSVG } from "qrcode.react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogTrigger
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MessageSquare, RefreshCw, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

export function WhatsAppConnect({ onSuccess }: { onSuccess?: () => void }) {
    const [status, setStatus] = useState<{ state: string; qr: string | null }>({ state: "disconnected", qr: null });
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const connectTriggered = useRef(false);

    const fetchStatus = async () => {
        setLoading(true);
        try {
            const data = await getWhatsAppStatus();
            setStatus(data);
        } catch (error) {
            console.error("Failed to fetch WhatsApp status", error);
        } finally {
            setLoading(false);
        }
    };

    const triggerConnect = async () => {
        setLoading(true);
        try {
            const data = await connectWhatsApp();
            setStatus({ state: data.state || "disconnected", qr: data.qr || null });
        } catch (error) {
            console.error("Failed to trigger WhatsApp connect", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        let interval: any;
        if (open && status.state !== "connected") {
            // On first open, trigger a fresh connection to generate QR code
            if (!connectTriggered.current) {
                connectTriggered.current = true;
                triggerConnect();
            }
            interval = setInterval(fetchStatus, 5000);
        } else if (status.state === "connected" && open) {
            onSuccess?.();
            const timeout = setTimeout(() => setOpen(false), 2000);
            return () => clearTimeout(timeout);
        }
        if (!open) {
            connectTriggered.current = false;
        }
        return () => clearInterval(interval);
    }, [open, status.state]);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className="w-full flex items-center gap-2 h-9 rounded-xl border-slate-100 hover:bg-slate-50 text-slate-600 font-medium transition-all"
                >
                    <MessageSquare className="w-4 h-4 text-emerald-500" />
                    <span>Connect WhatsApp</span>
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[400px] border-none shadow-2xl rounded-3xl p-8">
                <DialogHeader className="mb-6">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center mb-4">
                        <MessageSquare className="w-6 h-6 text-emerald-500" />
                    </div>
                    <DialogTitle className="text-xl font-display font-bold text-slate-900">
                        WhatsApp Integration
                    </DialogTitle>
                    <DialogDescription className="text-slate-500 text-[13px] leading-relaxed">
                        Link your WhatsApp account to CareOps to send and receive messages directly from the unified inbox.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col items-center justify-center py-4">
                    {status.state === "connected" ? (
                        <div className="flex flex-col items-center text-center animate-in zoom-in duration-300">
                            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
                                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                            </div>
                            <h4 className="font-bold text-slate-900 mb-1">WhatsApp Connected</h4>
                            <p className="text-[13px] text-slate-500">Your account is successfully linked.</p>
                        </div>
                    ) : status.qr ? (
                        <div className="flex flex-col items-center animate-in fade-in duration-500">
                            <div className="p-4 bg-white border-2 border-slate-50 rounded-2xl shadow-sm mb-6">
                                <QRCodeSVG value={status.qr} size={200} />
                            </div>
                            <ol className="text-[13px] text-slate-600 space-y-3 mb-6">
                                <li className="flex gap-3">
                                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-100 text-[11px] font-bold flex items-center justify-center text-slate-500">1</span>
                                    <span>Open WhatsApp on your phone</span>
                                </li>
                                <li className="flex gap-3">
                                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-100 text-[11px] font-bold flex items-center justify-center text-slate-500">2</span>
                                    <span>Tap Menu or Settings and select Linked Devices</span>
                                </li>
                                <li className="flex gap-3">
                                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-100 text-[11px] font-bold flex items-center justify-center text-slate-500">3</span>
                                    <span>Point your phone to this screen to scan the code</span>
                                </li>
                            </ol>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={fetchStatus}
                                disabled={loading}
                                className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full h-8 px-4"
                            >
                                <RefreshCw className={`w-3.5 h-3.5 mr-2 ${loading ? 'animate-spin' : ''}`} />
                                Refresh Code
                            </Button>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center py-10">
                            <Loader2 className="w-8 h-8 text-slate-200 animate-spin mb-4" />
                            <p className="text-[13px] text-slate-400 font-medium">Generating QR code...</p>
                        </div>
                    )}
                </div>

                {status.state !== "connected" && (
                    <div className="mt-4 p-4 rounded-2xl bg-amber-50 border border-amber-100 flex gap-3">
                        <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                        <p className="text-[11px] text-amber-700 leading-relaxed font-medium">
                            Scanning this code links your WhatsApp account via an unofficial bridge.
                            CareOps will be able to read and send messages.
                        </p>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
