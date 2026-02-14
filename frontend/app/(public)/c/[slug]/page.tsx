"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Send, Loader2, Mail, Phone, User, MessageSquare } from "lucide-react";

export default function PublicContactFormPage() {
    const params = useParams<{ slug: string }>();
    const slug = params.slug;
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [message, setMessage] = useState("");
    const [submitted, setSubmitted] = useState(false);
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);

        try {
            const response = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL}/api/v1/forms/public/${slug}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name, email, phone, message }),
                }
            );

            if (response.ok) {
                setSubmitted(true);
            }
        } catch (err) {
            console.error("Form submission failed:", err);
        } finally {
            setLoading(false);
        }
    }

    if (submitted) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
                <div className="w-full max-w-sm text-center">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-5">
                        <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                    </div>
                    <h1 className="font-display font-bold text-xl tracking-tight text-slate-900">
                        Thank You!
                    </h1>
                    <p className="text-[14px] text-slate-400 font-medium mt-2 max-w-xs mx-auto">
                        Your message has been received. We&apos;ll get back to you as soon as possible.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 py-8">
            <div className="w-full max-w-md">
                {/* Card */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-xl shadow-slate-200/30 overflow-hidden">
                    {/* Header */}
                    <div className="px-6 pt-7 pb-5">
                        <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center mb-4 shadow-lg shadow-slate-200">
                            <span className="text-white font-display font-bold text-base tracking-tighter">C</span>
                        </div>
                        <h1 className="font-display font-bold text-xl tracking-tight text-slate-900">
                            Get in Touch
                        </h1>
                        <p className="text-[13px] text-slate-400 font-medium mt-1.5">
                            Fill out the form below and we&apos;ll reach out shortly
                        </p>
                    </div>

                    {/* Form */}
                    <div className="px-6 pb-7">
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="name" className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                                    Full Name
                                </Label>
                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                                    <Input
                                        id="name"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="John Doe"
                                        className="rounded-xl h-11 pl-10 text-[13px] font-medium border-slate-100 focus-visible:ring-0 focus:border-slate-200 transition-colors"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="email" className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                                    Email Address
                                </Label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                                    <Input
                                        id="email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="you@example.com"
                                        className="rounded-xl h-11 pl-10 text-[13px] font-medium border-slate-100 focus-visible:ring-0 focus:border-slate-200 transition-colors"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="phone" className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                    Phone Number
                                </Label>
                                <div className="relative">
                                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                                    <Input
                                        id="phone"
                                        type="tel"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        placeholder="+91 98765 43210"
                                        className="rounded-xl h-11 pl-10 text-[13px] font-medium border-slate-100 focus-visible:ring-0 focus:border-slate-200 transition-colors"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="message" className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                                    Message
                                </Label>
                                <div className="relative">
                                    <MessageSquare className="absolute left-3 top-3 w-4 h-4 text-slate-300" />
                                    <textarea
                                        id="message"
                                        className="w-full min-h-[120px] rounded-xl border border-slate-100 bg-white pl-10 pr-3 py-2.5 text-[13px] font-medium placeholder:text-slate-300 focus:outline-none focus:border-slate-200 transition-colors resize-none"
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value)}
                                        placeholder="Tell us how we can help..."
                                        required
                                    />
                                </div>
                            </div>

                            <Button
                                type="submit"
                                className="w-full rounded-xl h-11 text-[13px] font-semibold bg-slate-900 hover:bg-slate-800 text-white shadow-md shadow-slate-200 gap-2 mt-2"
                                disabled={loading}
                            >
                                {loading ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</>
                                ) : (
                                    <><Send className="w-4 h-4" /> Send Message</>
                                )}
                            </Button>
                        </form>
                    </div>
                </div>

                {/* Footer */}
                <p className="text-center text-[11px] text-slate-300 font-medium mt-5">
                    Powered by CareOps
                </p>
            </div>
        </div>
    );
}
