"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { getTTSAudio } from "@/lib/api";
import { Volume2, VolumeX, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface TextToSpeechProps {
    text: string;
    autoPlay?: boolean;
}

export function TextToSpeech({ text, autoPlay = true }: TextToSpeechProps) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const lastTextRef = useRef<string>("");

    const handlePlay = useCallback(async () => {
        if (!text || isLoading || text === lastTextRef.current) return;
        lastTextRef.current = text;

        // Stop any currently playing audio
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
        }

        setIsLoading(true);
        try {
            const blob = await getTTSAudio(text);
            const url = URL.createObjectURL(blob);

            if (audioRef.current) {
                audioRef.current.src = url;
                // Wait for audio to load before playing
                await new Promise<void>((resolve, reject) => {
                    if (!audioRef.current) return reject();
                    audioRef.current.oncanplaythrough = () => resolve();
                    audioRef.current.onerror = () => reject();
                });
                await audioRef.current.play();
                setIsPlaying(true);
            }
        } catch (err) {
            // Ignore AbortError from rapid text changes
            if (err instanceof Error && err.name === "AbortError") return;
            console.error("TTS failed:", err);
        } finally {
            setIsLoading(false);
        }
    }, [text, isLoading]);

    useEffect(() => {
        if (autoPlay && text) {
            handlePlay();
        }
    }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="flex items-center gap-3 bg-muted/30 border border-border/50 p-3 rounded-none">
            <button
                onClick={() => { lastTextRef.current = ""; handlePlay(); }}
                className={cn(
                    "p-2 border border-border transition-colors cursor-pointer",
                    isPlaying ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
                )}
            >
                {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                ) : isPlaying ? (
                    <Volume2 className="w-4 h-4" />
                ) : (
                    <VolumeX className="w-4 h-4 opacity-50" />
                )}
            </button>
            <div className="flex flex-col">
                <span className="font-mono text-[10px] uppercase tracking-widest opacity-50">AUDIO_STREAM</span>
                <span className="font-mono text-[8px] uppercase tracking-tight truncate max-w-[200px]">
                    {isLoading ? "Fetching_Neural_Voice..." : isPlaying ? "Streaming_Now" : "Click_To_Replay"}
                </span>
            </div>
            <audio
                ref={audioRef}
                onEnded={() => setIsPlaying(false)}
                onError={() => setIsPlaying(false)}
                className="hidden"
            />
        </div>
    );
}
