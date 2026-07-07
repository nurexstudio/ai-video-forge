import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Volume2,
  VolumeX,
  Music,
  Mic,
  Play,
  Pause,
  Sparkles,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// ─── Inline types mirroring backend VoicePreset (kept local to avoid a Convex codegen dep) ───
type VoiceGender = "male" | "female" | "neutral";
type VoiceProvider =
  | "gemini"
  | "openai"
  | "groq"
  | "google_cloud"
  | "elevenlabs"
  | "huggingface";

interface VoicePreset {
  id: string;
  name: string;
  provider: VoiceProvider;
  envVar: string;
  gender: VoiceGender;
  language: string;
  style: string;
  description: string;
}

interface AudioTrack {
  id: string;
  name: string;
  volume: number;
  muted: boolean;
  bassBoost: number;
  source: "original" | "music";
}

const DEMO_TRACKS: AudioTrack[] = [
  { id: "a1", name: "Original Audio", volume: 0.8, muted: false, bassBoost: 2, source: "original" },
  { id: "a2", name: "Background Music", volume: 0.5, muted: false, bassBoost: 4, source: "music" },
];

function SwellCurve({ className = "" }: { className?: string }) {
  const points = Array.from({ length: 100 }, (_, i) => {
    const t = i / 99;
    let y: number;
    if (t < 0.15) y = 0.2 + (t / 0.15) * 0.1;
    else if (t < 0.7) y = 0.3 + ((t - 0.15) / 0.55) * 0.7;
    else if (t < 0.85) y = 1.0;
    else y = 1.0 - ((t - 0.85) / 0.15) * 0.7;
    return `${(i / 99) * 100},${(1 - y) * 40}`;
  });
  const d = `M0,40 L${points.join(" L")} L100,40 Z`;

  return (
    <svg viewBox="0 0 100 40" className={className}>
      <defs>
        <linearGradient id="swellGrad2" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FFE600" stopOpacity="0.3" />
          <stop offset="50%" stopColor="#FFE600" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.3" />
        </linearGradient>
      </defs>
      <path d={d} fill="url(#swellGrad2)" opacity="0.5" />
      {points.map((p, i) => {
        const [x, y] = p.split(",");
        return <circle key={i} cx={x} cy={y} r="0.8" fill="#000" opacity={0.8 - Math.abs(i / 99 - 0.7) * 0.6} />;
      })}
      <line x1="70" y1="0" x2="70" y2="40" stroke="#FF6B35" strokeWidth="0.5" strokeDasharray="2,2" opacity="0.6" />
      <text x="72" y="8" fontSize="3" fill="#FF6B35" fontFamily="monospace" fontWeight="bold">peak</text>
    </svg>
  );
}

const PROVIDER_BADGES: Record<VoiceProvider, { label: string; color: string }> = {
  gemini:      { label: "Gemini Native",     color: "bg-blue-500 text-white" },
  openai:      { label: "OpenAI TTS",         color: "bg-emerald-500 text-white" },
  groq:        { label: "Groq PlayAI",        color: "bg-orange-500 text-white" },
  google_cloud:{ label: "Google Cloud",       color: "bg-amber-500 text-white" },
  elevenlabs:  { label: "ElevenLabs",         color: "bg-violet-500 text-white" },
  huggingface: { label: "HuggingFace",        color: "bg-yellow-500 text-black" },
};

export default function AudioPanel() {
  const [tracks, setTracks] = useState<AudioTrack[]>(DEMO_TRACKS);
  const [masterVolume, setMasterVolume] = useState(80);

  // ─── TTS state ───
  const [ttsOpen, setTtsOpen] = useState(false);
  const [ttsText, setTtsText] = useState("Welcome to NUREX STUDIO — your AI video production studio.");
  const [genderFilter, setGenderFilter] = useState<"all" | VoiceGender>("all");
  const [languageFilter, setLanguageFilter] = useState<"all" | string>("all");
  const [voiceId, setVoiceId] = useState<string>("Kore");
  const [generating, setGenerating] = useState(false);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const [ttsAudio, setTtsAudio] = useState<{
    dataUrl: string;
    provider: string;
    voiceId: string;
  } | null>(null);
  const [playing, setPlaying] = useState(false);

  const listAvailableVoices = useAction((api as any).agent.listAvailableVoices as any);
  const synthesizeVoice = useAction((api as any).agent.synthesizeVoice as any);

  // Mounted-ref guards setState on unmounted component when the user closes the
  // panel mid-generation; muting the "setState on unmounted" React warning.
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // ─── Voice catalog load (auto-refresh when filters change) ───
  const [voices, setVoices] = useState<VoicePreset[]>([]);
  const [providersAvailable, setProvidersAvailable] = useState<VoiceProvider[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await listAvailableVoices({});
        if (cancelled) return;
        setVoices(res?.voices ?? []);
        setProvidersAvailable(res?.providers ?? []);
        // If currently selected voice no longer matches filters, reset to first available
        if (res?.voices && !res.voices.find((v: VoicePreset) => v.id === voiceId)) {
          const firstMatch = res.voices.find((v: VoicePreset) =>
            (genderFilter === "all" || v.gender === genderFilter) &&
            (languageFilter === "all" || v.language === languageFilter)
          );
          if (firstMatch) setVoiceId(firstMatch.id);
        }
      } catch {
        if (!cancelled) {
          setVoices([]);
          setProvidersAvailable([]);
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredVoices = useMemo(() => {
    return voices.filter((v) => {
      if (genderFilter !== "all" && v.gender !== genderFilter) return false;
      if (languageFilter !== "all" && v.language !== languageFilter) return false;
      return true;
    });
  }, [voices, genderFilter, languageFilter]);

  const selectedVoice = useMemo(() => voices.find((v) => v.id === voiceId), [voices, voiceId]);

  const updateTrack = (id: string, field: keyof AudioTrack, value: unknown) => {
    setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, [field]: value } : t)));
  };

  const toggleMute = (id: string) => {
    setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, muted: !t.muted } : t)));
  };

  async function handleGenerateVoice() {
    if (!ttsText.trim() || generating) return;
    setGenerating(true);
    setTtsError(null);
    try {
      const res = await synthesizeVoice({ text: ttsText.trim(), voiceId });
      if (!mountedRef.current) return;
      if (res?.success) {
        setTtsAudio({ dataUrl: res.dataUrl, provider: res.provider, voiceId: res.voiceId });
      } else {
        setTtsError(res?.error || "Voice synthesis failed");
      }
    } catch (e) {
      if (!mountedRef.current) return;
      setTtsError(e instanceof Error ? e.message : "Failed to call synthesize action");
    } finally {
      if (mountedRef.current) setGenerating(false);
    }
  }

  function togglePlayback() {
    const el = document.getElementById("tts-audio-el") as HTMLAudioElement | null;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      el.play().catch(() => setPlaying(false));
      setPlaying(true);
    }
  }

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="h-12 flex items-center justify-between px-4 border-b-2 border-black shrink-0">
        <span className="font-bold text-xs uppercase tracking-widest">Audio</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
            {providersAvailable.length > 0
              ? `${providersAvailable.length} TTS provider${providersAvailable.length === 1 ? "" : "s"} ready`
              : "No TTS key set"}
          </span>
          <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground border-2 border-black rounded-none">
            <Music className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-3 py-3 space-y-4">
        {/* ─── AI Voice Studio (TTS) ─── */}
        <div className="border-2 border-black bg-white shadow-[3px_3px_0px_#000]">
          <button
            type="button"
            onClick={() => setTtsOpen((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2.5 text-left"
          >
            <div className="flex items-center gap-2">
              <Mic className="w-4 h-4 text-black" />
              <span className="font-black text-xs uppercase tracking-widest">AI Voice Studio</span>
              {providersAvailable.length > 0 && (
                <span className="text-[9px] font-bold text-green-700 border border-green-700 px-1.5 py-0.5">
                  {voices.length} voices · {providersAvailable.length} providers
                </span>
              )}
            </div>
            {ttsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {ttsOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="border-t-2 border-black px-3 py-3 space-y-3"
            >
              {/* Filters: gender + language */}
              <div className="space-y-2">
                <div>
                  <span className="text-[9px] text-muted-foreground uppercase font-bold block mb-1">Gender</span>
                  <div role="radiogroup" aria-label="Voice gender filter" className="flex flex-wrap gap-1">
                    {(["all", "male", "female"] as const).map((g) => (
                      <button
                        key={g}
                        type="button"
                        aria-checked={genderFilter === g}
                        role="radio"
                        onClick={() => setGenderFilter(g)}
                        className={`px-2 py-0.5 text-[10px] font-bold border-2 border-black rounded-none transition-colors ${
                          genderFilter === g ? "bg-accent text-black shadow-[1px_1px_0px_#000]" : "bg-white text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {g === "all" ? "All" : g === "male" ? "Male" : "Female"}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-[9px] text-muted-foreground uppercase font-bold block mb-1">Language</span>
                  <div role="radiogroup" aria-label="Voice language filter" className="flex flex-wrap gap-1">
                    {(["all", "en", "ar"] as const).map((l) => (
                      <button
                        key={l}
                        type="button"
                        aria-checked={languageFilter === l}
                        role="radio"
                        onClick={() => setLanguageFilter(l)}
                        className={`px-2 py-0.5 text-[10px] font-bold border-2 border-black rounded-none transition-colors ${
                          languageFilter === l ? "bg-accent text-black shadow-[1px_1px_0px_#000]" : "bg-white text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {l === "all" ? "All" : l.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Voice dropdown */}
              {selectedVoice && (
                <div>
                  <span className="text-[9px] text-muted-foreground uppercase font-bold block mb-1">Voice</span>
                  <Select value={voiceId} onValueChange={setVoiceId}>
                    <SelectTrigger className="h-8 w-full text-xs font-bold bg-white border-2 border-black text-foreground rounded-none shadow-[1px_1px_0px_#000]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-2 border-black text-foreground rounded-none max-h-72">
                      {filteredVoices.length === 0 && (
                        <div className="px-2 py-3 text-[10px] font-bold text-muted-foreground">
                          No voices match the filters. Adjust gender/language.
                        </div>
                      )}
                      {filteredVoices.map((v) => {
                        const badge = PROVIDER_BADGES[v.provider];
                        return (
                          <SelectItem key={v.id} value={v.id} className="font-bold text-xs focus:bg-accent">
                            <div className="flex items-center gap-2 w-full">
                              <span
                                className={`px-1.5 py-0.5 text-[8px] border-2 border-black rounded-none ${badge.color}`}
                              >
                                {badge.label}
                              </span>
                              <span>{v.name}</span>
                              <span className="text-[9px] text-muted-foreground">· {v.style}</span>
                              <span className="text-[9px] text-muted-foreground ml-auto">{v.gender}</span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {selectedVoice && (
                    <p className="text-[10px] text-muted-foreground mt-1.5 px-0.5 leading-snug">
                      {selectedVoice.description}
                    </p>
                  )}
                </div>
              )}

              {/* Text input */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] text-muted-foreground uppercase font-bold">Narration Script</span>
                  <span className="text-[9px] text-muted-foreground font-mono">
                    {ttsText.length} chars
                  </span>
                </div>
                <Textarea
                  value={ttsText}
                  onChange={(e) => setTtsText(e.target.value)}
                  placeholder="Type the voiceover text here, e.g. 'In a world scarred by lies...' "
                  className="min-h-[80px] text-xs bg-white border-2 border-black text-foreground placeholder:text-muted-foreground focus-visible:ring-0 rounded-none resize-none"
                  maxLength={4000}
                  disabled={generating}
                />
              </div>

              {/* Generate button */}
              <Button
                type="button"
                onClick={handleGenerateVoice}
                disabled={generating || !selectedVoice || !ttsText.trim()}
                className="w-full h-9 text-xs font-bold bg-black text-white hover:bg-foreground border-2 border-black shadow-[2px_2px_0px_#000] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 mr-2" />
                    Generate Voice · {selectedVoice ? selectedVoice.name : "Pick a voice"}
                  </>
                )}
              </Button>

              {/* Error */}
              {ttsError && (
                <div className="flex items-start gap-2 border-2 border-red-500 bg-red-50 p-2 text-[10px] leading-relaxed text-red-700">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span className="font-bold">
                    {ttsError}
                    <br />
                    <span className="font-medium text-red-600">
                      Add the missing key in Project Settings → API Keys.
                    </span>
                  </span>
                </div>
              )}

              {/* Audio result */}
              {ttsAudio && (
                <div className="border-2 border-black bg-accent/30 p-2.5 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <span className="text-[10px] font-black text-foreground flex items-center gap-1.5">
                      <span className={`px-1.5 py-0.5 text-[8px] border-2 border-black rounded-none ${PROVIDER_BADGES[ttsAudio.provider as VoiceProvider]?.color || "bg-black text-white"}`}>
                        {PROVIDER_BADGES[ttsAudio.provider as VoiceProvider]?.label || ttsAudio.provider}
                      </span>
                      <span>via {ttsAudio.voiceId}</span>
                    </span>
                  </div>
                  <audio
                    id="tts-audio-el"
                    src={ttsAudio.dataUrl}
                    controls
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onEnded={() => setPlaying(false)}
                    className="w-full h-9 border-2 border-black"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={togglePlayback}
                      className="h-7 text-[10px] font-bold border-2 border-black"
                    >
                      {playing ? (
                        <><Pause className="w-3 h-3 mr-1" /> Pause</>
                      ) : (
                        <><Play className="w-3 h-3 mr-1" /> Play</>
                      )}
                    </Button>
                    <a
                      href={ttsAudio.dataUrl}
                      download={`tts-${ttsAudio.voiceId}.${ttsAudio.provider === "gemini" ? "wav" : "mp3"}`}
                      className="inline-flex items-center gap-1 border-2 border-black bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-widest shadow-[2px_2px_0px_#000] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
                    >
                      Download
                    </a>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </div>

        {/* Master volume */}
        <div className="border-2 border-black bg-white p-3 shadow-[2px_2px_0px_#000]">
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-xs">Master Volume</span>
            <span className="text-[11px] text-foreground tabular-nums">{masterVolume}%</span>
          </div>
          <Slider
            value={[masterVolume]}
            onValueChange={([v]) => setMasterVolume(v)}
            max={100} step={1}
            className="[&_[data-slot=slider-track]]:bg-muted [&_[data-slot=slider-track]]:border-2 [&_[data-slot=slider-track]]:border-black [&_[data-slot=slider-range]]:bg-black [&_[data-slot=slider-thumb]]:bg-black [&_[data-slot=slider-thumb]]:border-2 [&_[data-slot=slider-thumb]]:border-black"
          />
        </div>

        {/* Swell visualization */}
        <div className="border-2 border-black bg-white p-3 shadow-[2px_2px_0px_#000]">
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-xs">Music Swell Curve</span>
            <span className="text-[10px] text-muted-foreground">0.2 → 1.0 → 0.3</span>
          </div>
          <SwellCurve className="w-full h-16" />
          <div className="flex justify-between mt-1">
            <span className="text-[8px] text-muted-foreground">Start</span>
            <span className="text-[8px] text-foreground font-bold">Hook point</span>
            <span className="text-[8px] text-muted-foreground">End</span>
          </div>
        </div>

        {/* Audio tracks */}
        {tracks.map((track) => (
          <motion.div
            key={track.id}
            layout
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="border-2 border-black bg-white p-3 space-y-3 shadow-[1px_1px_0px_#000]"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 border border-black ${track.source === "music" ? "bg-black" : "bg-accent"}`} />
                <span className="font-bold text-xs">{track.name}</span>
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => toggleMute(track.id)} className={`w-6 h-6 border-2 border-black rounded-none ${track.muted ? "text-red-600" : "text-muted-foreground"} hover:text-foreground`}>
                {track.muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
              </Button>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] text-muted-foreground uppercase font-bold">Volume</span>
                <span className="text-[10px] tabular-nums">{Math.round(track.volume * 100)}%</span>
              </div>
              <Slider
                value={[track.volume * 100]}
                onValueChange={([v]) => updateTrack(track.id, "volume", v / 100)}
                max={100} step={1} disabled={track.muted}
                className="[&_[data-slot=slider-track]]:bg-muted [&_[data-slot=slider-track]]:border-2 [&_[data-slot=slider-track]]:border-black [&_[data-slot=slider-range]]:bg-black [&_[data-slot=slider-thumb]]:bg-black [&_[data-slot=slider-thumb]]:border-2 [&_[data-slot=slider-thumb]]:border-black"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] text-muted-foreground uppercase font-bold">Bass Boost</span>
                <span className="text-[10px] tabular-nums">{track.bassBoost} dB</span>
              </div>
              <Slider
                value={[track.bassBoost]}
                onValueChange={([v]) => updateTrack(track.id, "bassBoost", v)}
                max={12} step={1}
                className="[&_[data-slot=slider-track]]:bg-muted [&_[data-slot=slider-track]]:border-2 [&_[data-slot=slider-track]]:border-black [&_[data-slot=slider-range]]:bg-black [&_[data-slot=slider-thumb]]:bg-black [&_[data-slot=slider-thumb]]:border-2 [&_[data-slot=slider-thumb]]:border-black"
              />
            </div>

            <div>
              <span className="text-[9px] text-muted-foreground uppercase font-bold block mb-1">Source</span>
              <Select value={track.source} onValueChange={(v) => updateTrack(track.id, "source", v)}>
                <SelectTrigger className="h-8 w-full text-xs font-bold bg-white border-2 border-black text-foreground rounded-none shadow-[1px_1px_0px_#000]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-2 border-black text-foreground rounded-none">
                  <SelectItem value="original" className="font-bold text-xs">Original Audio</SelectItem>
                  <SelectItem value="music" className="font-bold text-xs">Background Music</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </motion.div>
        ))}

        {/* Ducking info */}
        <div className="border-2 border-black bg-white p-3 shadow-[1px_1px_0px_#000]">
          <span className="text-[9px] text-muted-foreground uppercase font-bold block mb-1">Dialog Ducking</span>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Automatically reduces background music volume when speech is detected. Uses high-pass filter at 200Hz.
          </p>
          <div className="flex items-center gap-2 mt-2">
            <div className="h-1 flex-1 bg-gradient-to-r from-muted via-black to-muted border border-black" />
            <span className="text-[9px] text-muted-foreground">100Hz · 200Hz · 300Hz</span>
          </div>
        </div>
      </div>
    </div>
  );
}
