import { motion, useScroll, useTransform, useMotionTemplate, useMotionValue, animate, AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CountUp } from "@/components/CountUp";
import { CyclingWord } from "@/components/CyclingWord";
import EditorMockup from "@/components/EditorMockup";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Wand2,
  Scissors,
  Music,
  Subtitles,
  ArrowRight,
  ArrowDown,
  Sparkles,
  Play,
  Mic,
  Image as ImageIcon,
  Globe,
  Brain,
  Youtube,
  Instagram,
  Mail,
  Check,
  Clock,
  Volume2,
  Captions,
  Gauge,
  Star,
  Crown,
  Quote,
  Activity,
} from "lucide-react";

import { NUREX_BRAND } from "@/lib/branding";

// ═══════════════════════════════════════════════════════════════════════════════
// Data
// ═══════════════════════════════════════════════════════════════════════════════

const stats = [
  { value: "16", label: "AI providers" },
  { value: "4×", label: "Faster pipeline" },
  { value: "9:16", label: "Auto-reframe" },
  { value: "4K", label: "Render quality" },
];

const features = [
  { icon: Brain, title: "AI Script Engine", body: "DeepSeek + Groq research your topic, structure the narrative, and write a publish-ready script — before a single frame is cut." },
  { icon: Globe, title: "Real Footage Sourcing", body: "Source authentic clips from the web, not AI slop. Every cut is grounded in real, contextually relevant footage." },
  { icon: Mic, title: "ElevenLabs Voiceover", body: "Pick from hundreds of AI voices, clone your own, or upload a sample. Word-level timing sync with captions." },
  { icon: Wand2, title: "Hook Detection", body: "Gemini 2.0 Flash scans frame-by-frame to surface the most engaging moments, scene changes, and viral hooks." },
  { icon: ImageIcon, title: "Thumbnail Studio", body: "Generated variations you can A/B test. Customize text, contrast, and composition right inside the editor." },
  { icon: Subtitles, title: "Word-Level Captions", body: "Whisper transcribes with frame-accurate timestamps. Style, time, and tweak everything before render." },
  { icon: Music, title: "Beat-Synced Music", body: "Drop in a track and we detect BPM. Cuts land on the beat, music ducks for voice, mixes feel professional." },
  { icon: Scissors, title: "Edit Scripts", body: "Receive a full edit-decision-list — cuts, overlays, transitions — and refine every second before export." },
];

type Example = {
  title: string; channel: string; duration: string;
  format: "9:16" | "16:9"; badge: string; accent: string; bg: string;
  captionLines: string[];
};

const examples: Example[] = [
  { title: "The Lighthouse That Refused to Die", channel: "True Crime · Coastal Mysteries", duration: "00:42", format: "9:16", badge: "Vertical", accent: "#FFE600", bg: "#FF3B30", captionLines: ["In 1972, the lantern went dark…", "But someone kept the watch.", "What happened next?"] },
  { title: "Why Your Salary Is Frozen", channel: "Finance · Macro Breakdown", duration: "00:58", format: "9:16", badge: "Hook 0:02", accent: "#FFFFFF", bg: "#111111", captionLines: ["Inflation isn't stopping.", "You just aren't moving.", "Here's the math…"] },
  { title: "Building a Civilization at 3 AM", channel: "History · Lost Empires", duration: "08:21", format: "16:9", badge: "Long-form", accent: "#FFE600", bg: "#0055FF", captionLines: ["Six centuries ago…", "A city appeared in the desert.", "Then it vanished."] },
];

const stack = ["DeepSeek", "Groq Whisper", "Gemini 2.0 Flash", "Llama 3.3 70B", "ElevenLabs", "OpenRouter", "Firecrawl", "FFmpeg"];

type FAQ = { q: string; a: string };
const faqs: FAQ[] = [
  { q: "How is ClipForge different from Premiere or Final Cut?", a: "Premiere is a manual editing timeline — you do everything by hand. ClipForge is a production studio that researches your topic, scripts the video, sources footage from the web, generates voiceovers, and edits — all before you ever touch the timeline. The editor is the final polish step, not the entire workflow." },
  { q: "Do I need my own API keys?", a: "No. We aggregate best-in-class AI providers (DeepSeek, Groq Whisper, Gemini, ElevenLabs, OpenRouter) and you use our pooled quota. On the Studio plan, you can add your own keys for fully isolated usage and uncached model routing." },
  { q: "Where does the footage come from — is it licensed?", a: "All footage sourcing uses Pexels' commercial library — every clip is cleared for YouTube, TikTok, Reels, and any platform. We never generate synthetic footage or use unlicensed sources." },
  { q: "How long does a single video take to produce?", a: "Most short-form clips finish in under 4 minutes from prompt to render. A 30-minute documentary typically takes 12–18 minutes including script review and final editor polish." },
  { q: "Can I export without a watermark on the free plan?", a: "No — Starter watermarks all exports at 720p to keep the free tier sustainable. The Creator plan (or higher) gives watermark-free 1080p exports." },
  { q: "What AI models power ClipForge?", a: "DeepSeek + Groq for scripts, Whisper-large-v3-turbo for captions, Gemini 2.0 Flash for visual analysis, ElevenLabs for voice, and Llama 3.3 70B through OpenRouter for reasoning. We route per-task to the best-fit provider, not the cheapest." },
  { q: "Are videos auto-captioned?", a: "Yes — Whisper transcribes uploaded audio with word-level timestamps, and caption styling is auto-applied based on aspect ratio. Review, restyle, or repaint before render." },
];

type Testimonial = { name: string; handle: string; channel: string; quote: string; metricLabel: string; metricValue: string; initials: string; avatarBg: string };

const testimonials: Testimonial[] = [
  { name: "Mira Adebayo", handle: "@coastmysteries", channel: "True Crime · YouTube", quote: "I publish two episodes a week. ClipForge's hook detection saved me 6 hours of editing per video and pulled our retention from 38% to 52%.", metricLabel: "Retention lift", metricValue: "+37%", initials: "MA", avatarBg: "#FF3B30" },
  { name: "Jonas Lindqvist", handle: "@financewithjonas", channel: "Finance · TikTok", quote: "I went from 4 videos a month to 4 videos a day. The vertical reframe and caption styling are better than Premiere + After Effects ever gave me.", metricLabel: "Posts per day", metricValue: "4×", initials: "JL", avatarBg: "#0055FF" },
  { name: "Priya Raman", handle: "@priya.history", channel: "Documentary · YouTube", quote: "The research + sourcing pipeline is unbeatable. DeepSeek writes scripts that actually hold up to 8 minutes — and the footage library is always on point.", metricLabel: "Subscribers added", metricValue: "118K", initials: "PR", avatarBg: "#00CC66" },
];

type PricingTier = { name: string; tagline: string; price: string; cadence: string; highlighted: boolean; ctaLabel: string; features: { label: string; included: boolean }[] };

const pricingTiers: PricingTier[] = [
  { name: "Starter", tagline: "For trying things out", price: "$0", cadence: "forever — no card", highlighted: false, ctaLabel: "Start Free", features: [
    { label: "3 short-form videos / month", included: true },
    { label: "Watermark export · 720p", included: true },
    { label: "Groq Whisper captions", included: true },
    { label: "Caption editor + reframe", included: true },
    { label: "Long-form documentaries", included: false },
    { label: "ElevenLabs voiceover", included: false },
    { label: "Brand presets & multi-channel", included: false },
  ]},
  { name: "Creator", tagline: "For solo creators & teams", price: "$29", cadence: "per month", highlighted: true, ctaLabel: "Upgrade Now", features: [
    { label: "Unlimited videos · any length", included: true },
    { label: "1080p export · no watermark", included: true },
    { label: "ElevenLabs voiceover library", included: true },
    { label: "Beat-synced music + hud", included: true },
    { label: "Brand kit & presets", included: true },
    { label: "Multi-platform publishing", included: true },
    { label: "Priority render queue", included: false },
  ]},
  { name: "Studio", tagline: "For agencies & newsrooms", price: "$129", cadence: "per month", highlighted: false, ctaLabel: "Talk to Sales", features: [
    { label: "Everything in Creator", included: true },
    { label: "4K render & team workspace", included: true },
    { label: "Custom voice cloning", included: true },
    { label: "API access + webhooks", included: true },
    { label: "Priority render queue", included: true },
    { label: "Dedicated success manager", included: true },
    { label: "SOC 2 audit + invoice billing", included: true },
  ]},
];

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

// Re-exported so tests can import without pulling the whole Landing tree.
function RevealOnView({ children, delay = 0, y = 24, className }: { children: React.ReactNode; delay?: number; y?: number; className?: string }) {
  return (
    <motion.div initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }} className={className}>
      {children}
    </motion.div>
  );
}

// Section heading helper (kept inline; small and tightly coupled to Landing).
function SectionHeading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <div className="text-center mb-14 max-w-2xl mx-auto">
      <Badge variant="outline" className="mb-5 text-xs px-4 py-1 border-2 border-black font-bold tracking-widest">{eyebrow}</Badge>
      <h2 className="text-4xl md:text-5xl font-black tracking-tight leading-[1.05]">{title}</h2>
      {subtitle && <p className="text-muted-foreground font-medium mt-4 text-lg leading-relaxed">{subtitle}</p>}
    </div>
  );
}

function ExampleCard({ example, index }: { example: Example; index: number }) {
  const ratioClass = example.format === "9:16" ? "aspect-[9/16]" : "aspect-video";
  return (
    <RevealOnView delay={index * 0.1} className="group">
      <div className="relative border-2 border-black bg-white overflow-hidden transition-all duration-300 group-hover:-translate-x-1 group-hover:-translate-y-1 group-hover:shadow-[10px_10px_0px_#000] shadow-[6px_6px_0px_#000]">
        <div className={`relative ${ratioClass} w-full border-b-2 border-black overflow-hidden`} style={{ backgroundColor: example.bg }}>
          <div className="absolute inset-0 opacity-20">
            <div className="absolute -top-12 -left-12 w-48 h-48 rounded-full border-[8px] border-white/30" />
            <div className="absolute -bottom-12 -right-12 w-56 h-56 rounded-full border-[10px] border-white/20" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-16 border-[3px] border-white bg-white/0 flex items-center justify-center transition-transform group-hover:scale-110">
              <Play className="w-6 h-6 text-white fill-white" />
            </div>
          </div>
          <div className="absolute top-3 right-3 flex flex-col gap-1.5">
            <span className="px-2.5 py-1 text-[10px] font-black uppercase tracking-widest border-2 border-black bg-white text-black">{example.badge}</span>
            <span className="px-2.5 py-1 text-[10px] font-black uppercase tracking-widest border-2 border-white self-end">{example.format}</span>
          </div>
          <div className="absolute bottom-3 left-3 right-3 space-y-1.5">
            {example.captionLines.map((line, i) => (
              <div key={i} className="px-2.5 py-1.5 border-2 border-black font-black text-xs md:text-sm inline-block max-w-full" style={{ backgroundColor: example.accent, color: "#111" }}>
                {line}
              </div>
            ))}
          </div>
        </div>
        <div className="p-5 space-y-2">
          <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-muted-foreground uppercase">
            <span className="w-1.5 h-1.5 bg-accent border border-black" />
            {example.channel}
            <span className="ml-auto flex items-center gap-1"><Clock className="w-3 h-3" />{example.duration}</span>
          </div>
          <h3 className="font-black text-lg leading-snug">{example.title}</h3>
          <div className="flex items-center gap-2 pt-2 border-t border-black/10">
            <Captions className="w-3.5 h-3.5" />
            <Gauge className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold text-muted-foreground ml-auto">AI · Generated 8s</span>
          </div>
        </div>
      </div>
    </RevealOnView>
  );
}

// Re-exported so tests can import without pulling the whole Landing tree.
function Marquee() {
  return (
    <div className="relative py-6 border-y-2 border-black bg-background overflow-hidden">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-background to-transparent z-10" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-background to-transparent z-10" />
      <motion.div className="flex gap-3 whitespace-nowrap" animate={{ x: ["0%", "-50%"] }} transition={{ duration: 30, repeat: Infinity, ease: "linear" }}>
        {[...stack, ...stack, ...stack].map((t, i) => (
          <div key={`${t}-${i}`} className="border-2 border-black px-5 py-2.5 font-black text-sm bg-white shadow-[3px_3px_0px_#000]">{t}</div>
        ))}
      </motion.div>
    </div>
  );
}

// Re-exported so tests can import without pulling the whole Landing tree.
function TestimonialCard({ testimonial, index }: { testimonial: Testimonial; index: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.5, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }} className="group relative border-2 border-black bg-background p-6 shadow-[4px_4px_0px_#000] hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[8px_8px_0px_#000] transition-all duration-300">
      <Quote className="absolute top-4 right-4 w-8 h-8 text-black/10 fill-current" />
      <div className="flex items-center gap-0.5 mb-5">
        {[0, 1, 2, 3, 4].map((i) => (<Star key={i} className="w-4 h-4 text-black fill-accent" strokeWidth={2.5} />))}
      </div>
      <p className="text-foreground font-medium leading-relaxed mb-6 text-[15px]">&ldquo;{testimonial.quote}&rdquo;</p>
      <div className="flex items-center gap-3 pt-4 border-t-2 border-black/10">
        <div className="w-12 h-12 border-2 border-black flex items-center justify-center font-black text-white text-sm shrink-0" style={{ backgroundColor: testimonial.avatarBg }}>{testimonial.initials}</div>
        <div className="flex-1 min-w-0">
          <div className="font-black text-sm leading-tight truncate">{testimonial.name}</div>
          <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest truncate">{testimonial.channel}</div>
        </div>
      </div>
      <div className="mt-5 inline-flex items-center gap-2 border-2 border-black bg-accent px-3 py-1.5 shadow-[3px_3px_0px_#000]">
        <span className="text-xs font-black tracking-widest uppercase">{testimonial.metricLabel}</span>
        <span className="text-base font-black">{testimonial.metricValue}</span>
      </div>
    </motion.div>
  );
}

// Re-exported so tests can import without pulling the whole Landing tree.
function PricingCard({ tier, index, onSelect }: { tier: PricingTier; index: number; onSelect: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.55, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }} className={`relative border-2 border-black bg-background transition-all duration-300 hover:-translate-x-1 hover:-translate-y-1 ${tier.highlighted ? "shadow-[10px_10px_0px_#000] bg-accent" : "shadow-[5px_5px_0px_#000]"} hover:shadow-[10px_10px_0px_#000]`}>
      {tier.highlighted && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 border-2 border-black bg-black text-accent px-3 py-1 shadow-[3px_3px_0px_#000]">
          <Crown className="w-3.5 h-3.5" strokeWidth={2.5} />
          <span className="text-[10px] font-black uppercase tracking-widest">Most Popular</span>
        </div>
      )}
      <div className={`p-7 ${tier.highlighted ? "text-black" : ""}`}>
        <div className="mb-6">
          <div className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">{tier.tagline}</div>
          <h3 className="text-2xl font-black tracking-tight mt-1">{tier.name}</h3>
        </div>
        <div className="mb-7">
          <div className="flex items-baseline gap-1.5">
            <span className="text-5xl font-black tracking-tight leading-none">{tier.price}</span>
          </div>
          <div className="text-xs font-bold text-muted-foreground mt-2 uppercase tracking-widest">{tier.cadence}</div>
        </div>
        <Button size="lg" variant={tier.highlighted ? "default" : "outline"} onClick={onSelect} className={`w-full ${tier.highlighted ? "bg-black text-white border-2 border-black hover:bg-white hover:text-black" : "border-2 border-black"}`}>
          {tier.ctaLabel}<ArrowRight className="w-4 h-4" />
        </Button>
        <ul className="mt-7 space-y-2.5">
          {tier.features.map((f) => (
            <li key={f.label} className={`flex items-start gap-2 text-sm font-bold leading-snug ${!f.included ? "opacity-40 line-through" : ""}`}>
              <span className={`mt-0.5 w-4 h-4 border-2 border-black flex items-center justify-center shrink-0 ${f.included ? (tier.highlighted ? "bg-black text-accent" : "bg-accent") : "bg-black/10"}`}>
                {f.included && <Check className="w-3 h-3" strokeWidth={4} />}
              </span>
              <span>{f.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}

// Scroll helper: smooth-scroll to a section by id (fallback when anchor links aren't enough)
function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════════

export default function Landing() {
  const navigate = useNavigate();
  const featuresRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({ target: featuresRef, offset: ["start end", "end start"] });
  const featuresOpacity = useTransform(scrollYProgress, [0, 0.2, 0.8, 1], [0.4, 1, 1, 0.4]);
  const { scrollYProgress: heroProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const mockupY = useTransform(heroProgress, [0, 1], [0, -60]);
  const blobY = useTransform(heroProgress, [0, 1], [0, -90]);
  const { scrollYProgress: navProgress } = useScroll({ offset: ["start start", "200px start"] });
  const navBgOpacity = useTransform(navProgress, [0, 1], [0.85, 1]);
  const navBorderOpacity = useTransform(navProgress, [0, 1], [0.6, 1]);
  const navBg = useMotionTemplate`rgba(255,253,247,${navBgOpacity})`;
  const navBorder = useMotionTemplate`rgba(0,0,0,${navBorderOpacity})`;

  return (
    <div className="min-h-screen bg-background text-foreground font-sans overflow-x-hidden">
      {/* Navigation */}
      <motion.nav className="fixed top-0 inset-x-0 z-50 border-b-2 border-black/60 backdrop-blur-sm" style={{ backgroundColor: navBg, borderColor: navBorder }}>
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <button onClick={() => navigate("/")} className="flex items-center gap-3 group">
            <div className="w-9 h-9 bg-black flex items-center justify-center transition-transform group-hover:-translate-y-0.5 group-hover:-translate-x-0.5">
              <Play className="w-4 h-4 text-white fill-white" />
            </div>
            <span className="font-black text-lg tracking-tight">CLIPFORGE</span>
          </button>
          <div className="hidden md:flex items-center gap-7 text-sm font-bold">
            <a href="#features" className="hover:text-black/60 transition-colors">Features</a>
            <a href="#examples" className="hover:text-black/60 transition-colors">Examples</a>
            <a href="#testimonials" className="hover:text-black/60 transition-colors">Customers</a>
            <a href="#pricing" className="hover:text-black/60 transition-colors">Pricing</a>
            <a href="#faq" className="hover:text-black/60 transition-colors">FAQ</a>
          </div>
          <Button variant="default" size="sm" onClick={() => navigate("/auth")}>Get Started<ArrowRight className="w-4 h-4" /></Button>
        </div>
      </motion.nav>

      {/* Hero */}
      <section ref={heroRef} className="relative pt-16 pb-24 md:pt-24 md:pb-32 border-b-2 border-black">
        <div className="absolute inset-0 opacity-[0.05] pointer-events-none" style={{ backgroundImage: "linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
        <motion.div className="absolute -top-40 -right-40 w-[480px] h-[480px] rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(255,230,0,0.35) 0%, transparent 70%)", y: blobY }} />
        <motion.div className="absolute -bottom-40 -left-40 w-[520px] h-[520px] rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(0,85,255,0.18) 0%, transparent 70%)", y: blobY }} />
        <motion.div aria-hidden className="absolute top-20 left-[8%] w-16 h-16 border-[3px] border-black bg-accent/40 pointer-events-none" animate={{ rotate: [0, 25, -10, 0], y: [0, -14, 0] }} transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }} />
        <motion.div aria-hidden className="absolute top-40 right-[14%] w-10 h-10 rounded-full border-[3px] border-black bg-blue-500/30 pointer-events-none" animate={{ y: [0, 22, 0], scale: [1, 1.15, 1] }} transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }} />
        <motion.div aria-hidden className="absolute bottom-32 right-[18%] w-20 h-20 border-[3px] border-black bg-white pointer-events-none" animate={{ rotate: [0, -12, 14, 0], x: [0, 8, 0] }} transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }} />
        <motion.div aria-hidden className="absolute bottom-44 left-[15%] w-12 h-12 border-[3px] border-black bg-accent pointer-events-none" animate={{ rotate: [0, 360], y: [0, -10, 0] }} transition={{ duration: 22, repeat: Infinity, ease: "linear" }} />
        <motion.div aria-hidden className="absolute top-[55%] left-[5%] w-6 h-6 bg-black pointer-events-none" animate={{ rotate: [0, 180, 360], scale: [1, 1.4, 1] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }} />
        <motion.div aria-hidden className="absolute top-[30%] right-[6%] w-8 h-8 border-[3px] border-black bg-blue-500 pointer-events-none" animate={{ y: [0, 18, 0], rotate: [0, 45, -45, 0] }} transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }} />

        <div className="max-w-6xl mx-auto px-4 relative">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} className="max-w-3xl mx-auto text-center">
            <Badge className="mb-7 text-sm px-4 py-1.5 border-2 border-black bg-accent text-black font-bold tracking-widest">
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />AI VIDEO PRODUCTION STUDIO
            </Badge>
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-black leading-[0.95] tracking-tight mb-8">
              From idea to <CyclingWord />.<br />
              <span className="text-muted-foreground">Shorts or documentaries.</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground font-medium mb-10 max-w-xl mx-auto leading-relaxed">
              AI researches, scripts, sources footage, generates voiceovers, and edits.
              From viral TikTok clips to 30-minute YouTube documentaries — in one studio.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" onClick={() => navigate("/auth")} className="group relative overflow-hidden">
                <span className="relative z-10 flex items-center gap-2">
                  Start Creating Free<ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </span>
                <div className="absolute inset-0 bg-accent opacity-0 group-hover:opacity-20 transition-opacity" />
              </Button>
              <Button variant="outline" size="lg" onClick={() => scrollTo("examples")}>
                <Play className="w-5 h-5" />See Examples
              </Button>
            </div>
          </motion.div>

          {/* Trusted-by social proof */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.5, ease: [0.22, 1, 0.36, 1] }} className="mt-14 text-center">
            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground">Trusted by creators at</span>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {["YouTube Creators", "TikTok", "Instagram Creators", "Product Hunt", "TechCrunch", "Forbes"].map((brand, i) => (
                <motion.span key={brand} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.6 + i * 0.06, ease: [0.22, 1, 0.36, 1] }} className="inline-flex items-center gap-1.5 border-2 border-black bg-background px-3 py-1 font-bold text-xs shadow-[2px_2px_0px_#000] hover:-translate-y-0.5 hover:shadow-[3px_3px_0px_#000] hover:bg-accent transition-all cursor-default">
                  {brand}
                </motion.span>
              ))}
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 80 }} animate={{ opacity: 1, y: 0 }} style={{ y: mockupY }} transition={{ duration: 0.9, delay: 0.3, ease: [0.22, 1, 0.36, 1] }} className="mt-20 max-w-4xl mx-auto relative">
            <EditorMockup />
            <div className="absolute -top-3 -right-3 md:-top-4 md:-right-4 z-10 flex items-center gap-2 border-2 border-black bg-accent px-3 py-1.5 shadow-[3px_3px_0px_#000] rotate-[3deg] hover:rotate-0 transition-transform">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-black opacity-60 animate-ping" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-black" />
              </span>
              <Activity className="w-3.5 h-3.5" strokeWidth={2.5} />
              <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">AI Working · 14 clips</span>
              <span className="text-[10px] font-black uppercase tracking-widest sm:hidden">AI · 14</span>
            </div>
            <div className="absolute -bottom-3 -left-3 md:-bottom-4 md:-left-4 z-10 hidden md:flex items-center gap-2 border-2 border-black bg-background px-3 py-1.5 shadow-[3px_3px_0px_#000] -rotate-[2deg] hover:rotate-0 transition-transform">
              <span className="w-2 h-2 bg-black animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-widest">Render ETA · 8s</span>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.65, delay: 0.4 }} className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-px bg-black border-2 border-black shadow-[6px_6px_0px_#000]">
            {stats.map((s) => {
              const m = s.value.match(/^(\d+)(.*)$/);
              const num = m ? parseInt(m[1], 10) : 0;
              const suffix = m ? m[2] : s.value;
              return (
                <div key={s.label} className="bg-background p-6 text-center">
                  <div className="text-3xl md:text-4xl font-black tracking-tight tabular-nums">
                    <CountUp target={num} suffix={suffix} />
                  </div>
                  <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mt-1">{s.label}</div>
                </div>
              );
            })}
          </motion.div>
        </div>
      </section>

      <Marquee />

      {/* Features */}
      <section id="features" ref={featuresRef} className="py-24 border-b-2 border-black">
        <motion.div style={{ opacity: featuresOpacity }} className="max-w-6xl mx-auto px-4">
          <SectionHeading eyebrow="Features" title="Everything you need to ship a video." subtitle="A single production pipeline — research, footage, voice, captions, edit, export. Replace a studio of tools with one workspace." />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {features.map((f, i) => (
              <motion.div key={f.title} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.45, delay: (i % 4) * 0.06, ease: [0.22, 1, 0.36, 1] }} className="group relative border-2 border-black bg-background p-6 transition-all duration-300 hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[6px_6px_0px_#000] shadow-[3px_3px_0px_#000]">
                <div className="w-12 h-12 border-2 border-black bg-accent flex items-center justify-center mb-5 group-hover:rotate-[-6deg] transition-transform">
                  <f.icon className="w-6 h-6 text-black" />
                </div>
                <h3 className="font-black text-base mb-2 tracking-tight">{f.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed font-medium">{f.body}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* Examples */}
      <section id="examples" className="py-24 border-b-2 border-black bg-white">
        <div className="max-w-6xl mx-auto px-4">
          <SectionHeading eyebrow="Examples" title="Real videos. Real pipelines." subtitle="From a 42-second TikTok hook to an 8-minute YouTube deep dive — these are render-ready outputs the studio prepares for you." />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-7">
            {examples.map((ex, i) => (
              <ExampleCard key={ex.title} example={ex} index={i} />
            ))}
          </div>
          <div id="workflow" className="mt-20">
            <div className="border-2 border-black bg-background p-6 md:p-8 shadow-[6px_6px_0px_#000]">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 border-2 border-black bg-black flex items-center justify-center">
                  <Wand2 className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <h3 className="font-black text-lg">6-step production pipeline</h3>
                  <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">From blank canvas to published render</p>
                </div>
                <div className="ml-auto hidden sm:flex items-center gap-2 border-2 border-black bg-background px-3 py-1.5 shadow-[3px_3px_0px_#000]">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-black opacity-60 animate-ping" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-black" />
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-widest">Live · Step 3 of 6</span>
                </div>
              </div>
              <ol className="flex flex-col md:flex-row gap-2 md:gap-1 items-stretch">
                {["Choose format", "Research & script", "Source footage", "Voice + captions", "Refine in editor", "Export"].map((step, i) => {
                  const isActive = i === 2;
                  const status: Array<"done" | "live" | "next"> = ["done", "done", "live", "next", "next", "next"];
                  return (
                    <li key={step} className="flex-1 flex md:flex-row flex-col items-stretch min-w-0">
                      <div className={`border-2 border-black ${isActive ? "bg-accent shadow-[4px_4px_0px_#000]" : "bg-background"} p-3.5 relative flex-1 min-w-0 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_#000] ${isActive ? "" : "hover:bg-accent/40"}`}>
                        <span className="text-2xl font-black text-black/10 absolute top-1 right-2">{String(i + 1).padStart(2, "0")}</span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Step {String(i + 1).padStart(2, "0")}</span>
                        <span className="block font-black text-sm mt-1 leading-snug">{step}</span>
                        <div className="mt-2 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest">
                          {status[i] === "done" && (
                            <><span className="w-1.5 h-1.5 bg-black" /><span className="text-muted-foreground">Done</span></>
                          )}
                          {status[i] === "live" && (
                            <><span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full rounded-full bg-black opacity-60 animate-ping" /><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-black" /></span><span>In progress · 3s</span></>
                          )}
                          {status[i] === "next" && (
                            <><span className="w-1.5 h-1.5 border border-black/40 bg-transparent" /><span className="text-muted-foreground">Queued</span></>
                          )}
                        </div>
                      </div>
                      {i < 5 && (
                        <div aria-hidden className="flex md:flex-col flex-row items-center justify-center text-black px-3 md:px-1.5 py-2 md:py-1">
                          <ArrowRight className="hidden md:block w-4 h-4" strokeWidth={3} />
                          <ArrowDown className="md:hidden w-4 h-4" strokeWidth={3} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section className="py-24 border-b-2 border-black">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <SectionHeading eyebrow="Use Cases" title="Built for every niche." subtitle="If there's footage online, ClipForge can turn it into a video." />
          <div className="flex flex-wrap items-center justify-center gap-2.5 max-w-4xl mx-auto">
            {["Documentary", "True Crime", "History", "Finance", "Science", "Top 10", "Geopolitics", "Tech Reviews", "Educational", "Sports", "AI News", "Product Recaps"].map((niche, i) => (
              <motion.div
                key={niche}
                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                whileInView={{ opacity: 1, scale: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35, delay: (i % 6) * 0.04 }}
                className="group flex items-center gap-2 border-2 border-black pl-2.5 pr-4 py-2 font-black text-sm bg-white shadow-[3px_3px_0px_#000] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-accent hover:shadow-[5px_5px_0px_#000] transition-all cursor-default"
              >
                <span className="text-[10px] font-black tracking-widest text-muted-foreground group-hover:text-black tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <span className="w-1.5 h-1.5 bg-accent border border-black group-hover:bg-black transition-colors" />
                <span>{niche}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-24 border-b-2 border-black bg-white">
        <div className="max-w-6xl mx-auto px-4">
          <SectionHeading eyebrow="Customers" title="The ones shipping faster than everyone else." subtitle="Creators who replaced their traditional stack with ClipForge — and the metrics that follow." />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <TestimonialCard key={t.handle} testimonial={t} index={i} />
            ))}
          </div>
          <div className="mt-12 border-2 border-black bg-background px-6 py-4 shadow-[4px_4px_0px_#000] flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm font-black">
            <div className="flex items-center gap-2">
              <span className="text-2xl text-black">4.9</span>
              <div className="flex items-center gap-0.5">
                {[0, 1, 2, 3, 4].map((i) => (<Star key={i} className="w-4 h-4 text-black fill-accent" strokeWidth={2.5} />))}
              </div>
            </div>
            <div className="hidden sm:block w-px h-6 bg-black/20" />
            <span className="text-muted-foreground font-bold tracking-widest uppercase text-xs">Trusted by 12,400+ creators</span>
            <div className="hidden sm:block w-px h-6 bg-black/20" />
            <span className="text-muted-foreground font-bold tracking-widest uppercase text-xs">1.8M videos rendered</span>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 border-b-2 border-black">
        <div className="max-w-6xl mx-auto px-4">
          <SectionHeading eyebrow="Pricing" title="Pay for what you ship." subtitle="Start free. Upgrade when you're posting daily. Studios scale on render minutes, not seats." />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-7 items-stretch pt-6">
            {pricingTiers.map((tier, i) => (
              <PricingCard key={tier.name} tier={tier} index={i} onSelect={() => navigate("/auth")} />
            ))}
          </div>
          <p className="text-center text-xs font-bold text-muted-foreground uppercase tracking-widest mt-8">All plans include 16 AI providers · Encrypted secrets · No platform fees</p>
        </div>
      </section>

      {/* FAQ — each answer has a "See pricing" CTA that smooth-scrolls to #pricing */}
      <section id="faq" className="py-24 border-b-2 border-black bg-white">
        <div className="max-w-3xl mx-auto px-4">
          <SectionHeading eyebrow="FAQ" title="Questions? We've got answers." subtitle="If you don't see what you're looking for, reach out — we typically respond within 24 hours." />
          <Accordion type="single" collapsible className="border-2 border-black bg-background shadow-[6px_6px_0px_#000]">
            {faqs.map((f, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="border-b border-black last:border-b-0 px-0">
                <AccordionTrigger className="px-5 py-4 text-base font-black tracking-tight hover:no-underline hover:text-black [&[data-state=open]]:bg-accent">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="px-5 pb-4 text-[15px] font-medium text-foreground leading-relaxed">
                  <p>{f.a}</p>
                  <button
                    type="button"
                    onClick={() => scrollTo("pricing")}
                    className="mt-4 inline-flex items-center gap-1.5 border-2 border-black bg-accent px-3 py-1.5 text-[11px] font-black uppercase tracking-widest shadow-[3px_3px_0px_#000] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] hover:bg-black hover:text-accent transition-colors"
                  >
                    See pricing
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          <div className="mt-8 text-center">
            <Button variant="outline" size="sm" onClick={() => navigate("/auth")} className="border-2 border-black">
              Still curious? Talk to the team <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative py-24 md:py-32 border-b-2 border-black bg-accent overflow-hidden">
        <div className="absolute inset-0 opacity-[0.12] pointer-events-none" style={{ backgroundImage: "linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
        <motion.div className="absolute -top-16 -left-16 w-64 h-64 border-4 border-black bg-white/15 pointer-events-none" animate={{ rotate: [0, 5, 0, -3, 0] }} transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }} />
        <motion.div className="absolute -bottom-12 -right-12 w-48 h-48 border-4 border-black bg-white/10 pointer-events-none" animate={{ rotate: [0, -6, 2, 0] }} transition={{ duration: 24, repeat: Infinity, ease: "easeInOut" }} />
        <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="max-w-4xl mx-auto px-4 text-center relative">
          <Badge variant="outline" className="mb-6 text-xs px-4 py-1 border-2 border-black bg-white font-black tracking-widest">
            <Check className="w-3 h-3 mr-1" /> Free · No card · 2-minute signup
          </Badge>
          <h2 className="text-5xl md:text-6xl lg:text-7xl font-black leading-[0.95] tracking-tight mb-6 text-black">
            Ready to ship<br />
            <span className="relative inline-block">
              <span className="relative z-10 bg-white px-3 py-1 border-2 border-black">your first video?</span>
            </span>
          </h2>
          <p className="text-lg text-black/70 font-medium mb-10 max-w-xl mx-auto">
            Shorts or documentaries. Pick a format and ClipForge does the rest.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" variant="default" onClick={() => navigate("/auth")} className="border-2 border-black bg-white text-black hover:bg-black hover:text-white shadow-[6px_6px_0px_#000] active:shadow-none active:translate-x-[6px] active:translate-y-[6px]">
              Get Started Now <ArrowRight className="w-5 h-5" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => scrollTo("examples")} className="border-2 border-black">
              <Play className="w-5 h-5" />See Examples
            </Button>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="py-10 bg-black text-white border-t-4 border-accent">
        <div className="max-w-6xl mx-auto px-4 flex flex-col gap-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-accent flex items-center justify-center">
                  <Play className="w-3.5 h-3.5 text-black fill-black" />
                </div>
                <span className="font-black text-sm tracking-tight">CLIPFORGE</span>
              </div>
              <span className="text-xs text-white/60 font-medium">
                · Built with <span className="font-black text-accent">{NUREX_BRAND.studio}</span>
              </span>
            </div>
            <div className="flex items-center gap-4 flex-wrap justify-center">
              <a href={NUREX_BRAND.youtubeUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs hover:text-accent transition-colors font-bold">
                <Youtube className="w-4 h-4" /><span>YouTube</span>
              </a>
              <a href={`mailto:${NUREX_BRAND.email}`} className="flex items-center gap-1.5 text-xs hover:text-accent transition-colors font-bold">
                <Mail className="w-4 h-4" /><span>{NUREX_BRAND.email}</span>
              </a>
              <a href={NUREX_BRAND.instagramUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs hover:text-accent transition-colors font-bold">
                <Instagram className="w-4 h-4" /><span>nurexst</span>
              </a>
              <button onClick={() => navigate("/auth")} className="text-xs text-white/60 hover:text-accent font-bold transition-colors ml-2">
                Sign In →
              </button>
            </div>
          </div>
          <div className="flex flex-col md:flex-row items-center justify-between gap-2 pt-4 border-t border-white/10">
            <p className="text-xs text-white/60 font-medium">© {new Date().getFullYear()} ClipForge — AI Video Studio v2.0</p>
            <p className="text-xs text-white/60 font-medium">16 providers · Modality Router · RAG memory · Encrypted secrets</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
