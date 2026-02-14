"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceInputProps {
    onRecordingComplete: (blob: Blob) => void;
    isProcessing?: boolean;
    disabled?: boolean;
}

export function VoiceInput({ onRecordingComplete, isProcessing, disabled }: VoiceInputProps) {
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationFrameRef = useRef<number | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            analyserRef.current = analyser;

            mediaRecorder.ondataavailable = (event) => {
                audioChunksRef.current.push(event.data);
            };

            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
                onRecordingComplete(audioBlob);
                stream.getTracks().forEach((track) => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
            draw();
        } catch (err) {
            console.error("Error accessing microphone:", err);
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            if (animationFrameRef.current !== null) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        }
    };

    const draw = () => {
        if (!analyserRef.current || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const renderFrame = () => {
            animationFrameRef.current = requestAnimationFrame(renderFrame);
            analyserRef.current!.getByteFrequencyData(dataArray);

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const barWidth = (canvas.width / bufferLength) * 2.5;
            let barHeight;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                barHeight = dataArray[i] / 2;
                ctx.fillStyle = `rgb(var(--primary))`;
                ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
                x += barWidth + 1;
            }
        };
        renderFrame();
    };

    return (
        <div className="flex flex-col items-center gap-6">
            <div className="relative w-32 h-32 flex items-center justify-center">
                {/* Decorative Ring */}
                <div className={cn(
                    "absolute inset-0 border-2 border-primary/20 rounded-none transition-all duration-500",
                    isRecording && "scale-125 opacity-0 border-primary"
                )} />

                <Button
                    size="icon"
                    className={cn(
                        "w-24 h-24 rounded-none border-2 transition-all duration-300",
                        isRecording ? "bg-destructive border-destructive text-destructive-foreground hover:bg-destructive/90" : "bg-primary border-primary hover:bg-primary/90",
                        (disabled || isProcessing) && "opacity-50 cursor-not-allowed"
                    )}
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={disabled || isProcessing}
                >
                    {isProcessing ? (
                        <Loader2 className="w-10 h-10 animate-spin" />
                    ) : isRecording ? (
                        <Square className="w-10 h-10 fill-current" />
                    ) : (
                        <Mic className="w-10 h-10" />
                    )}
                </Button>
            </div>

            <div className="w-full h-12 bg-muted/20 border border-border/50 overflow-hidden relative">
                <canvas ref={canvasRef} width={400} height={48} className="w-full h-full opacity-50" />
                {isRecording && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className="font-mono text-[10px] uppercase tracking-widest text-primary animate-pulse">RECORDING_STREAM_ACTIVE</span>
                    </div>
                )}
                {!isRecording && !isProcessing && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className="font-mono text-[10px] uppercase tracking-widest opacity-20">MIC_READY</span>
                    </div>
                )}
            </div>
        </div>
    );
}
