"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import {
    listBookings,
    listServices,
    createService,
    updateService,
    deleteService,
    searchContacts,
    getAvailableSlots,
    createBooking,
    transitionBooking,
    listInventory,
    getServiceInventory,
    setServiceInventory,
    getBusinessHours,
    updateBusinessHours,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
    Copy,
    ExternalLink,
    RefreshCw,
    Check,
    Plus,
    Trash2,
    Clock,
    Calendar as CalendarIcon,
    Settings2,
    Search,
    User,
    Package,
    ChevronDown,
    ChevronUp,
    Link2,
    Loader2,
    List,
    Grid3X3,
    ChevronLeft,
    ChevronRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Booking {
    id: string;
    contact_id: string;
    service_id: string | null;
    status: string;
    starts_at: string;
    ends_at: string;
    notes: string | null;
    created_at: string;
    contacts?: {
        full_name: string;
        email: string;
    };
}

interface Service {
    id: string;
    name: string;
    description: string | null;
    duration_mins: number;
    price: number;
    currency: string;
    is_active: boolean;
}

const STATUS_COLORS: Record<string, string> = {
    pending: "bg-amber-50 text-amber-600 border-amber-200",
    confirmed: "bg-emerald-50 text-emerald-600 border-emerald-200",
    completed: "bg-slate-50 text-slate-500 border-slate-200",
    cancelled: "bg-red-50 text-red-500 border-red-200",
    no_show: "bg-rose-50 text-rose-500 border-rose-200",
};

const STATUS_LABELS: Record<string, string> = {
    pending: "Pending",
    confirmed: "Confirmed",
    completed: "Completed",
    cancelled: "Cancelled",
    no_show: "No Show",
};

// Valid status transitions matching backend state machine
const VALID_TRANSITIONS: Record<string, string[]> = {
    pending: ["confirmed", "cancelled"],
    confirmed: ["completed", "cancelled", "no_show"],
    completed: [],
    cancelled: [],
    no_show: [],
};

const DAYS = [
    { id: "mon", name: "Monday", short: "Mon" },
    { id: "tue", name: "Tuesday", short: "Tue" },
    { id: "wed", name: "Wednesday", short: "Wed" },
    { id: "thu", name: "Thursday", short: "Thu" },
    { id: "fri", name: "Friday", short: "Fri" },
    { id: "sat", name: "Saturday", short: "Sat" },
    { id: "sun", name: "Sunday", short: "Sun" },
];

interface Contact {
    id: string;
    full_name: string;
    email: string;
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  Create Booking Modal                                                       */
/* ──────────────────────────────────────────────────────────────────────────── */

function CreateBookingModal({
    services,
    workspaceSlug,
    onSuccess
}: {
    services: Service[],
    workspaceSlug: string,
    onSuccess: () => void
}) {
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
    const [selectedService, setSelectedService] = useState<Service | null>(null);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [slots, setSlots] = useState<any[]>([]);
    const [selectedSlot, setSelectedSlot] = useState<any>(null);
    const [notes, setNotes] = useState("");

    const handleSearch = async () => {
        if (!search) return;
        setLoading(true);
        try {
            const data = await searchContacts(search);
            setContacts(data || []);
        } catch (err) {
            toast.error("Contact search failed");
        } finally {
            setLoading(false);
        }
    };

    const fetchSlots = async () => {
        if (!selectedService) return;
        setLoading(true);
        try {
            const data = await getAvailableSlots(workspaceSlug, selectedDate, selectedService.id);
            setSlots(data || []);
        } catch (err) {
            toast.error("Failed to load slots");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (open && step === 3 && selectedService) {
            fetchSlots();
        }
    }, [step, selectedDate, selectedService, open]);

    const handleBooking = async () => {
        if (!selectedContact || !selectedSlot || !selectedService) return;
        setLoading(true);
        try {
            await createBooking({
                contact_id: selectedContact.id,
                service_id: selectedService.id,
                starts_at: selectedSlot.starts_at,
                ends_at: selectedSlot.ends_at,
                notes,
            });
            toast.success("Booking created!");
            setOpen(false);
            onSuccess();
            // Reset
            setStep(1);
            setSelectedContact(null);
            setSelectedService(null);
            setSelectedSlot(null);
            setSearch("");
            setContacts([]);
        } catch (err) {
            toast.error("Booking failed");
        } finally {
            setLoading(false);
        }
    };

    const stepLabels = ["Customer", "Service", "Date & Time", "Confirm"];

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm" className="rounded-xl h-9 font-semibold text-[13px] gap-2 bg-slate-900 hover:bg-slate-800 text-white shadow-md shadow-slate-200">
                    <Plus className="w-3.5 h-3.5" /> New Booking
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[480px] rounded-2xl border-slate-100 bg-white p-0 overflow-hidden">
                <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-100">
                    <DialogTitle className="font-display font-bold text-base tracking-tight text-slate-900">
                        New Booking
                    </DialogTitle>
                    {/* Step indicator */}
                    <div className="flex items-center gap-1.5 mt-3">
                        {stepLabels.map((label, i) => (
                            <div key={label} className="flex items-center gap-1.5">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${step > i + 1 ? "bg-emerald-500 text-white" :
                                    step === i + 1 ? "bg-slate-900 text-white" :
                                        "bg-slate-100 text-slate-400"
                                    }`}>
                                    {step > i + 1 ? <Check className="w-3 h-3" /> : i + 1}
                                </div>
                                <span className={`text-[10px] font-semibold ${step === i + 1 ? "text-slate-900" : "text-slate-300"}`}>
                                    {label}
                                </span>
                                {i < stepLabels.length - 1 && (
                                    <div className={`w-4 h-px mx-0.5 ${step > i + 1 ? "bg-emerald-300" : "bg-slate-100"}`} />
                                )}
                            </div>
                        ))}
                    </div>
                </DialogHeader>

                <div className="px-6 py-5 space-y-4">
                    {step === 1 && (
                        <div className="space-y-4">
                            <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Find a customer</Label>
                            <div className="flex gap-2">
                                <Input
                                    placeholder="Search by name or email..."
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                                    className="rounded-xl h-10 text-[13px] font-medium border-slate-100 focus-visible:ring-0 focus:border-slate-200"
                                />
                                <Button size="sm" className="rounded-xl h-10 w-10 p-0 bg-slate-100 hover:bg-slate-200 text-slate-600" variant="secondary" onClick={handleSearch} disabled={loading}>
                                    <Search className="w-4 h-4" />
                                </Button>
                            </div>
                            <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                                {contacts.map(c => (
                                    <button
                                        key={c.id}
                                        onClick={() => { setSelectedContact(c); setStep(2); }}
                                        className="w-full text-left px-4 py-3 rounded-xl border border-slate-100 hover:bg-slate-50 hover:border-slate-200 transition-all text-[13px] flex items-center justify-between group"
                                    >
                                        <div>
                                            <p className="font-semibold text-slate-900">{c.full_name}</p>
                                            <p className="text-[11px] text-slate-400 mt-0.5">{c.email}</p>
                                        </div>
                                        <Plus className="w-3.5 h-3.5 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </button>
                                ))}
                                {contacts.length === 0 && !loading && search && (
                                    <p className="text-center py-6 text-[13px] text-slate-300 font-medium">No contacts found</p>
                                )}
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-4">
                            <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Choose a service</Label>
                            <div className="grid grid-cols-1 gap-1.5">
                                {services.map(s => (
                                    <button
                                        key={s.id}
                                        onClick={() => { setSelectedService(s); setStep(3); }}
                                        className="w-full text-left px-4 py-3 rounded-xl border border-slate-100 hover:bg-slate-50 hover:border-slate-200 transition-all text-[13px] flex justify-between items-center"
                                    >
                                        <span className="font-semibold text-slate-900">{s.name}</span>
                                        <span className="text-[11px] text-slate-400">{s.duration_mins} min · ₹{s.price}</span>
                                    </button>
                                ))}
                                {services.length === 0 && (
                                    <p className="text-center py-6 text-[13px] text-slate-300 font-medium">No services defined yet</p>
                                )}
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => setStep(1)} className="rounded-xl h-9 text-[13px] font-medium text-slate-400">← Back</Button>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-4">
                            <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Pick date & time</Label>
                            <Input
                                type="date"
                                value={selectedDate}
                                onChange={e => setSelectedDate(e.target.value)}
                                className="rounded-xl h-10 text-[13px] font-medium border-slate-100 focus-visible:ring-0"
                            />
                            <div className="grid grid-cols-3 gap-2 max-h-[200px] overflow-y-auto">
                                {loading ? (
                                    <div className="col-span-3 flex items-center justify-center py-6 gap-2">
                                        <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
                                        <span className="text-[13px] text-slate-300 font-medium">Loading slots...</span>
                                    </div>
                                ) : slots.length > 0 ? (
                                    slots.map((slot, i) => (
                                        <button
                                            key={i}
                                            onClick={() => { setSelectedSlot(slot); setStep(4); }}
                                            className="px-3 py-2.5 rounded-xl border border-slate-100 hover:border-slate-300 hover:bg-slate-50 text-[13px] font-semibold text-slate-700 text-center transition-all"
                                        >
                                            {new Date(slot.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })}
                                        </button>
                                    ))
                                ) : (
                                    <p className="col-span-3 text-center py-6 text-[13px] text-slate-300 font-medium">No available slots for this day</p>
                                )}
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => setStep(2)} className="rounded-xl h-9 text-[13px] font-medium text-slate-400">← Back</Button>
                        </div>
                    )}

                    {step === 4 && (
                        <div className="space-y-4">
                            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-2.5">
                                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Booking Summary</p>
                                <div className="space-y-1.5 text-[13px]">
                                    <p><span className="text-slate-400">Customer:</span> <span className="font-semibold text-slate-900">{selectedContact?.full_name}</span></p>
                                    <p><span className="text-slate-400">Service:</span> <span className="font-semibold text-slate-900">{selectedService?.name}</span></p>
                                    <p><span className="text-slate-400">Date:</span> <span className="font-semibold text-slate-900">{new Date(selectedDate).toDateString()}</span></p>
                                    <p><span className="text-slate-400">Time:</span> <span className="font-semibold text-slate-900">{new Date(selectedSlot?.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })}</span></p>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Notes (optional)</Label>
                                <Input
                                    placeholder="Add a note for your team..."
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                    className="rounded-xl h-10 text-[13px] font-medium border-slate-100 focus-visible:ring-0"
                                />
                            </div>
                            <div className="flex gap-2 pt-2">
                                <Button variant="ghost" size="sm" onClick={() => setStep(3)} className="rounded-xl h-10 flex-1 text-[13px] font-medium text-slate-400">← Back</Button>
                                <Button size="sm" onClick={handleBooking} disabled={loading} className="rounded-xl h-10 flex-1 text-[13px] font-semibold bg-slate-900 hover:bg-slate-800 text-white shadow-md shadow-slate-200">
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm Booking"}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  Main Bookings Page                                                         */
/* ──────────────────────────────────────────────────────────────────────────── */

export default function BookingsPage() {
    const profile = useWorkspaceStore((s) => s.profile);
    const [activeTab, setActiveTab] = useState("bookings");
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [services, setServices] = useState<Service[]>([]);
    const [bookingView, setBookingView] = useState<"calendar" | "list">("calendar");
    const [calendarMonth, setCalendarMonth] = useState(new Date());
    const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
    const [statusUpdating, setStatusUpdating] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);
    const [saving, setSaving] = useState(false);

    // Schedule state
    const [schedule, setSchedule] = useState<any>({});

    const bookingUrl = typeof window !== "undefined"
        ? `${window.location.origin}/b/${profile?.workspaceSlug}`
        : `/b/${profile?.workspaceSlug}`;

    const fetchAllData = useCallback(async () => {
        if (!profile) return;
        setLoading(true);
        try {
            const [bData, sData, bhData] = await Promise.all([
                listBookings(),
                listServices(),
                getBusinessHours(),
            ]);
            setBookings(bData || []);
            setServices(sData || []);

            // Set schedule from business_hours table
            if (bhData?.schedule) {
                setSchedule(bhData.schedule);
            } else {
                // Initialize default schedule
                const defaultSchedule: any = {};
                DAYS.forEach(d => {
                    defaultSchedule[d.id] = {
                        active: d.id !== "sat" && d.id !== "sun",
                        hours: [{ open: "09:00", close: "17:00" }]
                    };
                });
                setSchedule(defaultSchedule);
            }
        } catch (err) {
            console.error("Failed to fetch page data:", err);
        } finally {
            setLoading(false);
        }
    }, [profile]);

    useEffect(() => {
        fetchAllData();
    }, [fetchAllData]);

    // ── Bookings Logic ──────────────────────────────────────────────────

    function formatTime(iso: string) {
        return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
    }

    function formatDate(iso: string) {
        return new Date(iso).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
    }

    const copyBookingLink = async () => {
        try {
            await navigator.clipboard.writeText(bookingUrl);
            setCopied(true);
            toast.success("Link copied!");
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error("Copy failed");
        }
    };

    // ── Status Transition ───────────────────────────────────────────────
    const handleStatusChange = async (bookingId: string, newStatus: string) => {
        setStatusUpdating(bookingId);
        try {
            await transitionBooking(bookingId, newStatus);
            setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: newStatus } : b));
            toast.success(`Status updated to ${STATUS_LABELS[newStatus]}`);
        } catch (err: any) {
            toast.error(err?.response?.data?.detail || "Failed to update status");
        } finally {
            setStatusUpdating(null);
        }
    };

    // ── Calendar helpers ────────────────────────────────────────────────
    const calendarDays = useMemo(() => {
        const year = calendarMonth.getFullYear();
        const month = calendarMonth.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startOffset = (firstDay.getDay() + 6) % 7; // Monday-start
        const days: (Date | null)[] = [];
        for (let i = 0; i < startOffset; i++) days.push(null);
        for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));
        return days;
    }, [calendarMonth]);

    const bookingsByDate = useMemo(() => {
        const map: Record<string, Booking[]> = {};
        bookings.forEach(b => {
            const key = new Date(b.starts_at).toLocaleDateString("en-CA"); // YYYY-MM-DD
            if (!map[key]) map[key] = [];
            map[key].push(b);
        });
        return map;
    }, [bookings]);

    const filteredBookings = useMemo(() => {
        if (!selectedCalendarDate) return bookings;
        return bookingsByDate[selectedCalendarDate] || [];
    }, [selectedCalendarDate, bookingsByDate, bookings]);

    const prevMonth = () => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1));
    const nextMonth = () => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1));
    const todayStr = new Date().toLocaleDateString("en-CA");

    // ── Schedule Logic ──────────────────────────────────────────────────

    const toggleDay = (dayId: string) => {
        setSchedule((prev: any) => ({
            ...prev,
            [dayId]: { ...prev[dayId], active: !prev[dayId].active }
        }));
    };

    const updateHours = (dayId: string, index: number, field: string, value: string) => {
        setSchedule((prev: any) => {
            const newHours = [...prev[dayId].hours];
            newHours[index] = { ...newHours[index], [field]: value };
            return {
                ...prev,
                [dayId]: { ...prev[dayId], hours: newHours }
            };
        });
    };

    const saveSchedule = async () => {
        if (!profile) return;
        setSaving(true);
        try {
            await updateBusinessHours(schedule);
            toast.success("Schedule saved!");
        } catch (err) {
            console.error("Failed to save schedule:", err);
            toast.error("Failed to save schedule");
        } finally {
            setSaving(false);
        }
    };

    // ── Services Logic ──────────────────────────────────────────────────

    const [isAddingService, setIsAddingService] = useState(false);
    const [newService, setNewService] = useState({ name: "", duration_mins: 30, price: 0 });

    const handleAddService = async () => {
        try {
            const data = await createService(newService);
            setServices(prev => [...prev, data]);
            setIsAddingService(false);
            setNewService({ name: "", duration_mins: 30, price: 0 });
            toast.success("Service added!");
        } catch (err) {
            toast.error("Failed to add service");
        }
    };

    const handleDeleteService = async (id: string) => {
        try {
            await deleteService(id);
            setServices(prev => prev.filter(s => s.id !== id));
            toast.success("Service removed");
        } catch (err) {
            toast.error("Failed to remove service");
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="font-display font-bold text-xl tracking-tight text-slate-900">
                        Bookings & Schedule
                    </h1>
                    <p className="text-[13px] text-slate-400 font-medium mt-1">
                        Manage appointments, availability, and services
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl h-9 text-[13px] font-medium border-slate-200 text-slate-500 hover:text-slate-900"
                        onClick={fetchAllData}
                    >
                        <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
                    </Button>
                    <a
                        href={bookingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <Button
                            size="sm"
                            variant="outline"
                            className="rounded-xl h-9 text-[13px] font-medium border-slate-200 text-slate-500 hover:text-slate-900 gap-1.5"
                        >
                            <ExternalLink className="w-3.5 h-3.5" /> View Booking Page
                        </Button>
                    </a>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="bg-slate-100/50 rounded-xl h-11 p-1 border border-slate-100">
                    <TabsTrigger value="bookings" className="rounded-lg text-[13px] font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm">
                        <CalendarIcon className="w-3.5 h-3.5 mr-2" /> Bookings
                    </TabsTrigger>
                    <TabsTrigger value="schedule" className="rounded-lg text-[13px] font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm">
                        <Clock className="w-3.5 h-3.5 mr-2" /> Schedule
                    </TabsTrigger>
                    <TabsTrigger value="services" className="rounded-lg text-[13px] font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm">
                        <Settings2 className="w-3.5 h-3.5 mr-2" /> Services
                    </TabsTrigger>
                </TabsList>

                {/* --- Bookings Tab --- */}
                <TabsContent value="bookings" className="mt-6 space-y-4">
                    {/* Booking link bar + View toggle + New booking */}
                    <div className="flex items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-100 rounded-xl">
                        <div className="flex items-center gap-3 flex-1 overflow-hidden">
                            <Link2 className="w-4 h-4 text-slate-300 shrink-0" />
                            <span className="text-[11px] font-semibold text-slate-400 shrink-0">Booking Link</span>
                            <code className="text-[12px] text-slate-500 font-medium truncate flex-1">
                                {bookingUrl}
                            </code>
                            <button onClick={copyBookingLink} className="shrink-0 p-1.5 rounded-lg hover:bg-white transition-colors">
                                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                            </button>
                        </div>
                        <div className="shrink-0 h-6 w-px bg-slate-200 mx-1" />
                        {/* View toggle */}
                        <div className="flex items-center bg-white rounded-lg border border-slate-100 p-0.5">
                            <button onClick={() => { setBookingView("calendar"); setSelectedCalendarDate(null); }} className={`p-1.5 rounded-md transition-all ${bookingView === "calendar" ? "bg-slate-900 text-white shadow-sm" : "text-slate-400 hover:text-slate-600"}`}>
                                <Grid3X3 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => { setBookingView("list"); setSelectedCalendarDate(null); }} className={`p-1.5 rounded-md transition-all ${bookingView === "list" ? "bg-slate-900 text-white shadow-sm" : "text-slate-400 hover:text-slate-600"}`}>
                                <List className="w-3.5 h-3.5" />
                            </button>
                        </div>
                        <div className="shrink-0 h-6 w-px bg-slate-200 mx-1" />
                        <CreateBookingModal services={services} workspaceSlug={profile?.workspaceSlug || ""} onSuccess={fetchAllData} />
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-16 gap-2">
                            <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
                            <span className="text-[13px] text-slate-300 font-medium">Loading bookings...</span>
                        </div>
                    ) : bookings.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 p-12 text-center">
                            <CalendarIcon className="w-10 h-10 text-slate-200 mx-auto mb-4" />
                            <p className="text-[15px] font-semibold text-slate-400">No bookings yet</p>
                            <p className="text-[13px] text-slate-300 mt-1.5 max-w-xs mx-auto">Share your booking link with customers to start receiving appointments.</p>
                        </div>
                    ) : (
                        <>
                            {/* ═══ CALENDAR VIEW ═══ */}
                            {bookingView === "calendar" && (
                                <div className="space-y-4">
                                    <Card className="rounded-2xl border-slate-100 shadow-sm overflow-hidden max-w-lg">
                                        <CardContent className="p-0">
                                            {/* Month navigation */}
                                            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-white">
                                                <button onClick={prevMonth} className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                                                    <ChevronLeft className="w-3.5 h-3.5" />
                                                </button>
                                                <h3 className="text-[13px] font-bold text-slate-900 tracking-tight">
                                                    {calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                                                </h3>
                                                <button onClick={nextMonth} className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                                                    <ChevronRight className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                            {/* Day headers */}
                                            <div className="grid grid-cols-7">
                                                {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map(d => (
                                                    <div key={d} className="text-center py-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-wider">{d}</div>
                                                ))}
                                            </div>
                                            {/* Calendar grid */}
                                            <div className="grid grid-cols-7">
                                                {calendarDays.map((day, i) => {
                                                    if (!day) return <div key={`empty-${i}`} className="py-2" />;
                                                    const dateStr = day.toLocaleDateString("en-CA");
                                                    const dayBookings = bookingsByDate[dateStr] || [];
                                                    const isToday = dateStr === todayStr;
                                                    const isSelected = dateStr === selectedCalendarDate;
                                                    const isPast = dateStr < todayStr;
                                                    return (
                                                        <button
                                                            key={dateStr}
                                                            onClick={() => setSelectedCalendarDate(isSelected ? null : dateStr)}
                                                            className={`py-2 flex flex-col items-center justify-center gap-0.5 transition-all rounded-lg mx-0.5
                                                            ${isSelected ? "bg-slate-900 text-white" : isToday ? "bg-emerald-50" : isPast ? "" : "hover:bg-slate-50"}`}
                                                        >
                                                            <span className={`text-[11px] font-semibold leading-none ${isSelected ? "text-white" : isToday ? "text-emerald-600" : isPast ? "text-slate-300" : "text-slate-700"}`}>
                                                                {day.getDate()}
                                                            </span>
                                                            {dayBookings.length > 0 && (
                                                                <div className="flex items-center gap-px mt-0.5">
                                                                    {dayBookings.length <= 3 ? (
                                                                        dayBookings.map((b, j) => (
                                                                            <div key={j} className={`w-1 h-1 rounded-full ${isSelected ? "bg-white/70" : b.status === "completed" ? "bg-slate-300" : b.status === "confirmed" ? "bg-emerald-400" : b.status === "cancelled" ? "bg-rose-400" : "bg-amber-400"}`} />
                                                                        ))
                                                                    ) : (
                                                                        <span className={`text-[8px] font-bold ${isSelected ? "text-white/80" : "text-slate-400"}`}>{dayBookings.length}</span>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </CardContent>
                                    </Card>

                                    {/* Day detail list under calendar */}
                                    {selectedCalendarDate && (
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <p className="text-[13px] font-semibold text-slate-700">
                                                    {new Date(selectedCalendarDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                                                    <span className="text-slate-400 font-medium ml-2">· {filteredBookings.length} {filteredBookings.length === 1 ? "booking" : "bookings"}</span>
                                                </p>
                                                <button onClick={() => setSelectedCalendarDate(null)} className="text-[11px] font-medium text-slate-400 hover:text-slate-600">Clear filter</button>
                                            </div>
                                            {filteredBookings.length === 0 ? (
                                                <p className="text-[13px] text-slate-300 font-medium py-6 text-center">No bookings on this day</p>
                                            ) : (
                                                <div className="space-y-2">
                                                    {filteredBookings.map(booking => (
                                                        <div key={booking.id} className="flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-white hover:shadow-sm transition-shadow">
                                                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                                                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                                                                    <User className="w-3.5 h-3.5 text-slate-400" />
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-[13px] font-semibold text-slate-900 truncate">{booking.contacts?.full_name || "—"}</p>
                                                                    <p className="text-[11px] text-slate-400 mt-0.5">{formatTime(booking.starts_at)} – {formatTime(booking.ends_at)}</p>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                {VALID_TRANSITIONS[booking.status]?.length > 0 ? (
                                                                    <select
                                                                        value={booking.status}
                                                                        onChange={e => handleStatusChange(booking.id, e.target.value)}
                                                                        disabled={statusUpdating === booking.id}
                                                                        className={`text-[11px] font-semibold rounded-full px-3 py-1 border cursor-pointer appearance-none pr-6 bg-[length:12px] bg-[right_6px_center] bg-no-repeat ${STATUS_COLORS[booking.status] || ""}`}
                                                                        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")` }}
                                                                    >
                                                                        <option value={booking.status}>{STATUS_LABELS[booking.status]}</option>
                                                                        {VALID_TRANSITIONS[booking.status]?.map(s => (
                                                                            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                                                                        ))}
                                                                    </select>
                                                                ) : (
                                                                    <Badge variant="outline" className={`rounded-full text-[10px] font-semibold px-2.5 ${STATUS_COLORS[booking.status] || ""}`}>
                                                                        {STATUS_LABELS[booking.status] || booking.status}
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ═══ LIST VIEW ═══ */}
                            {bookingView === "list" && (
                                <div className="rounded-xl border border-slate-100 overflow-hidden">
                                    <div className="grid grid-cols-[1fr_1fr_1fr_130px_60px] gap-4 bg-slate-50 border-b border-slate-100 px-5 py-3">
                                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Customer</span>
                                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Date</span>
                                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Time</span>
                                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status</span>
                                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider text-center">Notes</span>
                                    </div>
                                    {bookings.map((booking) => (
                                        <div key={booking.id} className="grid grid-cols-[1fr_1fr_1fr_130px_60px] gap-4 px-5 py-3.5 border-b border-slate-50 last:border-b-0 hover:bg-slate-50/50 transition-colors">
                                            <div className="min-w-0">
                                                <p className="text-[13px] font-semibold text-slate-900 truncate">{booking.contacts?.full_name || "—"}</p>
                                                <p className="text-[11px] text-slate-400 truncate mt-0.5">{booking.contacts?.email || ""}</p>
                                            </div>
                                            <span className="text-[13px] text-slate-600 font-medium self-center">{formatDate(booking.starts_at)}</span>
                                            <span className="text-[13px] text-slate-600 font-medium self-center">{formatTime(booking.starts_at)} – {formatTime(booking.ends_at)}</span>
                                            <div className="self-center">
                                                {VALID_TRANSITIONS[booking.status]?.length > 0 ? (
                                                    <select
                                                        value={booking.status}
                                                        onChange={e => handleStatusChange(booking.id, e.target.value)}
                                                        disabled={statusUpdating === booking.id}
                                                        className={`text-[10px] font-semibold rounded-full px-2.5 py-1 border cursor-pointer appearance-none pr-6 bg-[length:12px] bg-[right_6px_center] bg-no-repeat ${STATUS_COLORS[booking.status] || ""}`}
                                                        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")` }}
                                                    >
                                                        <option value={booking.status}>{STATUS_LABELS[booking.status]}</option>
                                                        {VALID_TRANSITIONS[booking.status]?.map(s => (
                                                            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <Badge variant="outline" className={`rounded-full text-[10px] font-semibold px-2.5 w-fit ${STATUS_COLORS[booking.status] || ""}`}>
                                                        {STATUS_LABELS[booking.status] || booking.status}
                                                    </Badge>
                                                )}
                                            </div>
                                            <span className="text-[13px] text-slate-400 text-center self-center">{booking.notes ? "📝" : "—"}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </TabsContent>

                {/* --- Schedule Tab --- */}
                <TabsContent value="schedule" className="mt-6">
                    <Card className="rounded-2xl border-slate-100 shadow-sm">
                        <CardHeader className="border-b border-slate-100 px-6 py-4">
                            <CardTitle className="font-display font-bold text-base tracking-tight text-slate-900 flex items-center justify-between">
                                Business Hours (UTC)
                                <Button
                                    size="sm"
                                    className="rounded-xl h-9 text-[13px] font-semibold bg-slate-900 hover:bg-slate-800 text-white shadow-md shadow-slate-200"
                                    onClick={saveSchedule}
                                    disabled={saving}
                                >
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                                    {saving ? "Saving..." : "Save Changes"}
                                </Button>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {DAYS.map((day) => {
                                const config = schedule[day.id] || { active: false, hours: [] };
                                return (
                                    <div key={day.id} className="flex items-center gap-6 px-6 py-4 border-b border-slate-50 last:border-b-0">
                                        <div className="w-36 shrink-0 flex items-center gap-3">
                                            <Switch
                                                checked={config.active}
                                                onCheckedChange={() => toggleDay(day.id)}
                                            />
                                            <span className={`text-[13px] font-semibold transition-colors ${config.active ? 'text-slate-900' : 'text-slate-300'}`}>
                                                {day.name}
                                            </span>
                                        </div>

                                        <div className="flex-1 flex flex-col gap-2">
                                            {config.active ? (
                                                config.hours.map((range: any, idx: number) => (
                                                    <div key={idx} className="flex items-center gap-2">
                                                        <Input
                                                            type="time"
                                                            className="w-32 h-9 rounded-xl bg-slate-50 border-slate-100 text-[13px] font-medium focus-visible:ring-0"
                                                            value={range.open}
                                                            onChange={(e) => updateHours(day.id, idx, "open", e.target.value)}
                                                        />
                                                        <span className="text-slate-300 text-sm">to</span>
                                                        <Input
                                                            type="time"
                                                            className="w-32 h-9 rounded-xl bg-slate-50 border-slate-100 text-[13px] font-medium focus-visible:ring-0"
                                                            value={range.close}
                                                            onChange={(e) => updateHours(day.id, idx, "close", e.target.value)}
                                                        />
                                                    </div>
                                                ))
                                            ) : (
                                                <span className="text-[13px] text-slate-300 font-medium">Closed</span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* --- Services Tab --- */}
                <TabsContent value="services" className="mt-6 space-y-4">
                    <div className="flex justify-between items-center">
                        <div>
                            <p className="text-[13px] text-slate-400 font-medium">
                                {services.length} {services.length === 1 ? "service" : "services"} offered
                            </p>
                        </div>
                        <Button
                            size="sm"
                            className="rounded-xl h-9 text-[13px] font-semibold gap-2 bg-slate-900 hover:bg-slate-800 text-white shadow-md shadow-slate-200"
                            onClick={() => setIsAddingService(true)}
                        >
                            <Plus className="w-3.5 h-3.5" /> Add Service
                        </Button>
                    </div>

                    {isAddingService && (
                        <Card className="rounded-2xl border-slate-200 border-dashed bg-slate-50/50">
                            <CardContent className="p-5 grid grid-cols-4 gap-4 items-end">
                                <div className="space-y-2">
                                    <Label className="text-[11px] font-semibold text-slate-500">Name</Label>
                                    <Input
                                        className="h-10 rounded-xl text-[13px] font-medium border-slate-100 focus-visible:ring-0"
                                        placeholder="e.g. Consultation"
                                        value={newService.name}
                                        onChange={e => setNewService({ ...newService, name: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[11px] font-semibold text-slate-500">Duration (min)</Label>
                                    <Input
                                        type="number"
                                        className="h-10 rounded-xl text-[13px] font-medium border-slate-100 focus-visible:ring-0"
                                        value={newService.duration_mins}
                                        onChange={e => setNewService({ ...newService, duration_mins: parseInt(e.target.value) })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[11px] font-semibold text-slate-500">Price (₹)</Label>
                                    <Input
                                        type="number"
                                        className="h-10 rounded-xl text-[13px] font-medium border-slate-100 focus-visible:ring-0"
                                        value={newService.price}
                                        onChange={e => setNewService({ ...newService, price: parseFloat(e.target.value) })}
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        size="sm"
                                        className="h-10 flex-1 rounded-xl text-[13px] font-semibold bg-slate-900 hover:bg-slate-800 text-white"
                                        onClick={handleAddService}
                                        disabled={!newService.name}
                                    >
                                        Save
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-10 rounded-xl text-[13px] font-medium text-slate-400"
                                        onClick={() => setIsAddingService(false)}
                                    >
                                        Cancel
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {services.map(s => (
                            <ServiceCardWithInventory key={s.id} service={s} onDelete={() => handleDeleteService(s.id)} />
                        ))}
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}

/* ─── Service Card with Inventory Linking ─────────────────────────────────── */

interface InvItem {
    id: string;
    name: string;
    unit: string;
    quantity: number;
}

interface ServiceInvLink {
    id: string;
    item_id: string;
    qty_per_use: number;
    item_name: string | null;
    item_unit: string | null;
}

function ServiceCardWithInventory({
    service,
    onDelete,
}: {
    service: Service;
    onDelete: () => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const [links, setLinks] = useState<ServiceInvLink[]>([]);
    const [allItems, setAllItems] = useState<InvItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    // New link form
    const [selectedItemId, setSelectedItemId] = useState("");
    const [qtyPerUse, setQtyPerUse] = useState(1);

    async function loadData() {
        setLoading(true);
        try {
            const [linksData, itemsData] = await Promise.all([
                getServiceInventory(service.id),
                listInventory(),
            ]);
            setLinks(linksData);
            setAllItems(itemsData);
        } catch (err) {
            console.error("Failed to load service inventory:", err);
        } finally {
            setLoading(false);
        }
    }

    function handleExpand() {
        if (!expanded) loadData();
        setExpanded(!expanded);
    }

    async function addLink() {
        if (!selectedItemId) return;
        const newLinks = [
            ...links.map((l) => ({ item_id: l.item_id, qty_per_use: l.qty_per_use })),
            { item_id: selectedItemId, qty_per_use: qtyPerUse },
        ];
        setSaving(true);
        try {
            const result = await setServiceInventory(service.id, newLinks);
            setLinks(result);
            setSelectedItemId("");
            setQtyPerUse(1);
        } catch (err) {
            console.error("Failed to add link:", err);
        } finally {
            setSaving(false);
        }
    }

    async function removeLink(itemId: string) {
        const newLinks = links
            .filter((l) => l.item_id !== itemId)
            .map((l) => ({ item_id: l.item_id, qty_per_use: l.qty_per_use }));
        setSaving(true);
        try {
            const result = await setServiceInventory(service.id, newLinks);
            setLinks(result);
        } catch (err) {
            console.error("Failed to remove link:", err);
        } finally {
            setSaving(false);
        }
    }

    // Items not yet linked
    const availableItems = allItems.filter(
        (i) => !links.some((l) => l.item_id === i.id)
    );

    return (
        <Card className="rounded-2xl border-slate-100 shadow-sm hover:shadow-md transition-shadow group">
            <CardContent className="p-5">
                <div className="flex items-center justify-between">
                    <div className="space-y-1">
                        <h3 className="text-[14px] font-bold text-slate-900 tracking-tight">
                            {service.name}
                        </h3>
                        <div className="flex items-center gap-3 text-[12px] text-slate-400 font-medium">
                            <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" /> {service.duration_mins} min
                            </span>
                            <span>₹{service.price}</span>
                            {links.length > 0 && (
                                <span className="flex items-center gap-1 text-blue-500">
                                    <Package className="w-3 h-3" /> {links.length} {links.length === 1 ? "item" : "items"}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 rounded-xl text-slate-400 hover:text-slate-900"
                            onClick={handleExpand}
                            title="Manage inventory items"
                        >
                            {expanded ? (
                                <ChevronUp className="w-4 h-4" />
                            ) : (
                                <ChevronDown className="w-4 h-4" />
                            )}
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity text-rose-500 hover:text-rose-600 hover:bg-rose-50"
                            onClick={onDelete}
                        >
                            <Trash2 className="w-4 h-4" />
                        </Button>
                    </div>
                </div>

                {/* Expandable inventory linking panel */}
                {expanded && (
                    <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                            Linked Inventory — Auto-deducted on completion
                        </p>

                        {loading ? (
                            <div className="h-8 bg-slate-50 rounded-lg animate-pulse" />
                        ) : (
                            <>
                                {/* Linked items list */}
                                {links.length > 0 ? (
                                    <div className="space-y-1.5">
                                        {links.map((link) => (
                                            <div
                                                key={link.item_id}
                                                className="flex items-center justify-between bg-slate-50 rounded-xl px-3.5 py-2.5"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <Package className="w-3.5 h-3.5 text-slate-400" />
                                                    <span className="text-[13px] font-semibold text-slate-700">
                                                        {link.item_name || "Unknown"}
                                                    </span>
                                                    <span className="text-[11px] text-slate-400">
                                                        ×{link.qty_per_use}{" "}
                                                        {link.item_unit || "pcs"}
                                                    </span>
                                                </div>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7 w-7 p-0 rounded-lg text-rose-400 hover:text-rose-500 hover:bg-rose-50"
                                                    onClick={() => removeLink(link.item_id)}
                                                    disabled={saving}
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-[13px] text-slate-300 font-medium text-center py-3">
                                        No items linked yet
                                    </p>
                                )}

                                {/* Add link form */}
                                {availableItems.length > 0 && (
                                    <div className="flex items-end gap-2">
                                        <div className="flex-1 space-y-1.5">
                                            <Label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                                                Item
                                            </Label>
                                            <select
                                                className="w-full h-9 bg-white border border-slate-100 rounded-xl px-3 text-[13px] font-medium text-slate-700 focus:outline-none focus:border-slate-200"
                                                value={selectedItemId}
                                                onChange={(e) =>
                                                    setSelectedItemId(e.target.value)
                                                }
                                            >
                                                <option value="">Select item...</option>
                                                {availableItems.map((item) => (
                                                    <option key={item.id} value={item.id}>
                                                        {item.name} ({item.quantity} {item.unit})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="w-20 space-y-1.5">
                                            <Label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                                                Qty
                                            </Label>
                                            <Input
                                                type="number"
                                                min={1}
                                                className="h-9 rounded-xl text-[13px] font-medium border-slate-100 focus-visible:ring-0"
                                                value={qtyPerUse}
                                                onChange={(e) =>
                                                    setQtyPerUse(
                                                        parseInt(e.target.value) || 1
                                                    )
                                                }
                                            />
                                        </div>
                                        <Button
                                            size="sm"
                                            className="h-9 rounded-xl text-[12px] font-semibold gap-1.5 bg-slate-900 hover:bg-slate-800 text-white"
                                            onClick={addLink}
                                            disabled={!selectedItemId || saving}
                                        >
                                            <Plus className="w-3 h-3" /> Link
                                        </Button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
