"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getAvailableSlots, getPublicServices, createPublicBooking } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock, ChevronLeft, CheckCircle2, Loader2, ArrowRight, CalendarDays } from "lucide-react";

interface Slot {
    starts_at: string;
    ends_at: string;
    service_id: string | null;
}

interface Service {
    id: string;
    name: string;
    duration_mins: number;
    price: number;
}

type Step = "service" | "datetime" | "confirm";

export default function PublicBookingPage() {
    const params = useParams<{ slug: string }>();
    const slug = params.slug;

    // ── State ──────────────────────────────────────────────────────────────
    const [step, setStep] = useState<Step>("service");
    const [selectedService, setSelectedService] = useState<Service | null>(null);
    const [selectedDate, setSelectedDate] = useState(
        new Date().toISOString().split("T")[0]
    );
    const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    // ── Queries ────────────────────────────────────────────────────────────
    const { data: services, isLoading: servicesLoading } = useQuery<Service[]>({
        queryKey: ["public-services", slug],
        queryFn: () => getPublicServices(slug),
        enabled: !!slug,
    });

    const { data: slots, isLoading: slotsLoading } = useQuery<Slot[]>({
        queryKey: ["slots", slug, selectedDate, selectedService?.id],
        queryFn: () => getAvailableSlots(slug, selectedDate, selectedService?.id),
        enabled: !!slug && step === "datetime",
    });

    // ── Confirm Booking ────────────────────────────────────────────────────
    async function handleBook(e: React.FormEvent) {
        e.preventDefault();
        if (!selectedSlot || !name || !email || !phone) return;
        setSubmitting(true);

        try {
            await createPublicBooking(slug, {
                name,
                email,
                phone,
                starts_at: selectedSlot.starts_at,
                ends_at: selectedSlot.ends_at,
                service_id: selectedService?.id,
                notes: `Booked: ${selectedService?.name || "General"} by ${name} (${email})`,
            });
            setSubmitted(true);
        } catch (err) {
            console.error("Booking failed:", err);
        } finally {
            setSubmitting(false);
        }
    }

    const stepLabels = [
        { key: "service", label: "Service" },
        { key: "datetime", label: "Date & Time" },
        { key: "confirm", label: "Confirm" },
    ];
    const currentStepIndex = stepLabels.findIndex(s => s.key === step);

    // ── Confirmed View ─────────────────────────────────────────────────────
    if (submitted) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
                <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-100 shadow-lg shadow-slate-100 overflow-hidden">
                    <div className="p-8 text-center space-y-4">
                        <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
                            <CheckCircle2 className="w-7 h-7 text-emerald-500" />
                        </div>
                        <div>
                            <h1 className="font-display font-bold text-xl tracking-tight text-slate-900">
                                Booking Confirmed
                            </h1>
                            <p className="text-[13px] text-slate-400 font-medium mt-2">
                                A confirmation has been sent to
                            </p>
                            <p className="text-[13px] font-semibold text-slate-900 mt-0.5">{email}</p>
                            <p className="text-[12px] text-slate-400 font-medium mt-1">& WhatsApp ({phone})</p>
                        </div>
                        {selectedService && (
                            <div className="pt-3 border-t border-slate-100">
                                <p className="text-[12px] text-slate-400 font-medium">
                                    {selectedService.name} · {selectedService.duration_mins} min
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ── Main View ──────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 py-8">
            <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-100 shadow-lg shadow-slate-100 overflow-hidden">
                {/* ── Header ── */}
                <div className="px-6 pt-6 pb-5 border-b border-slate-100">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center">
                            <CalendarDays className="w-4.5 h-4.5 text-white" />
                        </div>
                        <h1 className="font-display font-bold text-lg tracking-tight text-slate-900">
                            Book an Appointment
                        </h1>
                    </div>

                    {/* Step indicator */}
                    <div className="flex items-center gap-1">
                        {stepLabels.map((s, i) => (
                            <div key={s.key} className="flex items-center gap-1 flex-1">
                                <div className="flex items-center gap-2 flex-1">
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all shrink-0 ${i < currentStepIndex ? "bg-emerald-500 text-white" :
                                        i === currentStepIndex ? "bg-slate-900 text-white" :
                                            "bg-slate-100 text-slate-400"
                                        }`}>
                                        {i < currentStepIndex ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
                                    </div>
                                    <span className={`text-[11px] font-semibold hidden sm:inline ${i === currentStepIndex ? "text-slate-900" : "text-slate-300"
                                        }`}>
                                        {s.label}
                                    </span>
                                </div>
                                {i < stepLabels.length - 1 && (
                                    <div className={`h-px flex-1 min-w-4 mx-1 ${i < currentStepIndex ? "bg-emerald-300" : "bg-slate-100"}`} />
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="flex h-1 bg-slate-50">
                    <div className={`transition-all duration-500 bg-slate-900 rounded-full ${step === "service" ? "w-1/3" : step === "datetime" ? "w-2/3" : "w-full"
                        }`} />
                </div>

                <div className="p-6 space-y-5">

                    {/* ═══ STEP 1: SERVICE SELECTION ═══ */}
                    {step === "service" && (
                        <div className="space-y-4">
                            <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                                Choose a service
                            </Label>

                            {servicesLoading ? (
                                <div className="space-y-2">
                                    {[1, 2, 3].map((i) => (
                                        <div key={i} className="h-16 bg-slate-50 rounded-xl animate-pulse" />
                                    ))}
                                </div>
                            ) : !services?.length ? (
                                <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center">
                                    <p className="text-[13px] font-medium text-slate-400">
                                        No services available
                                    </p>
                                    <p className="text-[12px] text-slate-300 mt-1">
                                        Please contact the business to set up services.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {services.map((svc) => {
                                        const isSelected = selectedService?.id === svc.id;
                                        return (
                                            <button
                                                key={svc.id}
                                                type="button"
                                                className={`w-full text-left px-4 py-3.5 rounded-xl border transition-all ${isSelected
                                                    ? "bg-slate-900 text-white border-slate-900 shadow-md shadow-slate-200"
                                                    : "bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50"
                                                    }`}
                                                onClick={() => setSelectedService(svc)}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <span className={`text-[14px] font-semibold tracking-tight ${isSelected ? "text-white" : "text-slate-900"}`}>
                                                        {svc.name}
                                                    </span>
                                                    {isSelected && (
                                                        <CheckCircle2 className="w-4 h-4 text-white" />
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-3 mt-1.5">
                                                    <span className={`flex items-center gap-1 text-[12px] font-medium ${isSelected ? "text-white/70" : "text-slate-400"}`}>
                                                        <Clock className="w-3 h-3" /> {svc.duration_mins} min
                                                    </span>
                                                    {svc.price > 0 && (
                                                        <span className={`text-[12px] font-medium ${isSelected ? "text-white/70" : "text-slate-400"}`}>
                                                            ₹{svc.price}
                                                        </span>
                                                    )}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            <Button
                                className="w-full rounded-xl h-11 font-semibold text-[13px] bg-slate-900 hover:bg-slate-800 text-white shadow-md shadow-slate-200 gap-2"
                                disabled={!selectedService}
                                onClick={() => setStep("datetime")}
                            >
                                Choose Date & Time <ArrowRight className="w-4 h-4" />
                            </Button>
                        </div>
                    )}

                    {/* ═══ STEP 2: DATE & TIME SELECTION ═══ */}
                    {step === "datetime" && (
                        <div className="space-y-4">
                            <button
                                type="button"
                                className="flex items-center gap-1 text-[12px] font-medium text-slate-400 hover:text-slate-600 transition-colors"
                                onClick={() => { setStep("service"); setSelectedSlot(null); }}
                            >
                                <ChevronLeft className="w-3.5 h-3.5" /> Back to services
                            </button>

                            {/* Selected service summary */}
                            {selectedService && (
                                <div className="px-4 py-3 rounded-xl bg-slate-50 border border-slate-100">
                                    <p className="text-[12px] text-slate-400 font-medium">
                                        Selected: <span className="font-semibold text-slate-900">{selectedService.name}</span> · {selectedService.duration_mins} min
                                    </p>
                                </div>
                            )}

                            {/* Date Picker */}
                            <div className="space-y-2">
                                <Label htmlFor="date" className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                                    Choose a date
                                </Label>
                                <Input
                                    id="date"
                                    type="date"
                                    className="rounded-xl h-10 text-[13px] font-medium border-slate-100 focus-visible:ring-0 focus:border-slate-200"
                                    value={selectedDate}
                                    min={new Date().toISOString().split("T")[0]}
                                    onChange={(e) => {
                                        setSelectedDate(e.target.value);
                                        setSelectedSlot(null);
                                    }}
                                />
                            </div>

                            {/* Slots Grid */}
                            <div className="space-y-2">
                                <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                                    Available times
                                </Label>
                                <ScrollArea className="h-48">
                                    {slotsLoading ? (
                                        <div className="flex items-center justify-center py-12 gap-2">
                                            <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
                                            <span className="text-[13px] text-slate-300 font-medium">Loading slots...</span>
                                        </div>
                                    ) : slots?.length === 0 ? (
                                        <p className="text-[13px] text-slate-300 font-medium py-12 text-center">
                                            No available slots for this date
                                        </p>
                                    ) : (
                                        <div className="grid grid-cols-3 gap-2">
                                            {slots?.map((slot, i) => {
                                                const time = new Date(slot.starts_at).toLocaleTimeString([], {
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                    hour12: false,
                                                    timeZone: "UTC",
                                                });
                                                const isSelected = selectedSlot?.starts_at === slot.starts_at;
                                                return (
                                                    <button
                                                        key={i}
                                                        type="button"
                                                        className={`h-10 rounded-xl text-[13px] font-semibold transition-all ${isSelected
                                                            ? "bg-slate-900 text-white shadow-md shadow-slate-200"
                                                            : "bg-slate-50 border border-slate-100 text-slate-700 hover:border-slate-200 hover:bg-white"
                                                            }`}
                                                        onClick={() => setSelectedSlot(slot)}
                                                    >
                                                        {time}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </ScrollArea>
                                {selectedSlot && (
                                    <div className="px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-100">
                                        <p className="text-[12px] font-semibold text-emerald-600">
                                            Selected: {new Date(selectedSlot.starts_at).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} — {new Date(selectedSlot.ends_at).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} (UTC)
                                        </p>
                                    </div>
                                )}
                            </div>

                            <Button
                                className="w-full rounded-xl h-11 font-semibold text-[13px] bg-slate-900 hover:bg-slate-800 text-white shadow-md shadow-slate-200 gap-2"
                                disabled={!selectedSlot}
                                onClick={() => setStep("confirm")}
                            >
                                Continue <ArrowRight className="w-4 h-4" />
                            </Button>
                        </div>
                    )}

                    {/* ═══ STEP 3: CONTACT INFO & CONFIRM ═══ */}
                    {step === "confirm" && (
                        <div className="space-y-4">
                            <button
                                type="button"
                                className="flex items-center gap-1 text-[12px] font-medium text-slate-400 hover:text-slate-600 transition-colors"
                                onClick={() => setStep("datetime")}
                            >
                                <ChevronLeft className="w-3.5 h-3.5" /> Back to time selection
                            </button>

                            {/* Booking Summary */}
                            <div className="rounded-xl bg-slate-50 border border-slate-100 overflow-hidden">
                                {selectedService && (
                                    <div className="px-4 py-3 border-b border-slate-100">
                                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Service</p>
                                        <p className="text-[14px] font-semibold text-slate-900 mt-0.5">{selectedService.name}</p>
                                    </div>
                                )}
                                {selectedSlot && (
                                    <div className="px-4 py-3">
                                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Date & Time</p>
                                        <p className="text-[14px] font-semibold text-slate-900 mt-0.5">
                                            {new Date(selectedSlot.starts_at).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}{" "}
                                            · {new Date(selectedSlot.starts_at).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} — {new Date(selectedSlot.ends_at).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} (UTC)
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Contact Form */}
                            <form onSubmit={handleBook} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name" className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                                        Your Name
                                    </Label>
                                    <Input
                                        id="name"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="John Doe"
                                        className="rounded-xl h-10 text-[13px] font-medium border-slate-100 focus-visible:ring-0 focus:border-slate-200"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="email" className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                                        Email Address
                                    </Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="john@example.com"
                                        className="rounded-xl h-10 text-[13px] font-medium border-slate-100 focus-visible:ring-0 focus:border-slate-200"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="phone" className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                                        WhatsApp Number
                                    </Label>
                                    <Input
                                        id="phone"
                                        type="tel"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        placeholder="919876543210"
                                        className="rounded-xl h-10 text-[13px] font-medium border-slate-100 focus-visible:ring-0 focus:border-slate-200"
                                        required
                                    />
                                    <p className="text-[10px] text-slate-400">Include country code (e.g. 91 for India)</p>
                                </div>
                                <Button
                                    type="submit"
                                    className="w-full rounded-xl h-11 font-semibold text-[13px] bg-slate-900 hover:bg-slate-800 text-white shadow-md shadow-slate-200"
                                    disabled={submitting}
                                >
                                    {submitting ? (
                                        <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Booking...</>
                                    ) : (
                                        "Confirm Booking"
                                    )}
                                </Button>
                            </form>
                        </div>
                    )}
                </div>

                <div className="border-t border-slate-100 bg-slate-50/50 px-6 py-3 text-center">
                    <p className="text-[11px] text-slate-300 font-medium">
                        Powered by CareOps
                    </p>
                </div>
            </div>
        </div>
    );
}
