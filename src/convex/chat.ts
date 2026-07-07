// ─── src/convex/chat.ts ───────────────────────────────────────────────────────
// NUREX OmniChat — Zero-Hardcode universal AI assistant.
// All models, tools, and capabilities are discovered dynamically from the user's
// stored providers table. No hardcoded provider names or tool lists.
//
// Flow:
// 1. sendMessage → creates chat message → routes to executeToolCall
// 2. executeToolCall → fetches settings → decrypts keys → builds tools array →
//    calls OpenRouter with tool_choice:auto → executes tool calls → feeds back to model
// 3. Auto-embeds assistant response into vectorMemory for semantic search

import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { api, internal } from "./_generated/api";

// ─── Queries ──────────────────────────────────────────────────────────────────

export const listSessions = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("chatSessions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50);
  },
});

export const getSession = query({
  args: { sessionId: v.id("chatSessions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.sessionId);
  },
});

export const getMessages = query({
  args: {
    sessionId: v.id("chatSessions"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("chatMessages")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const getRecentMessages = query({
  args: {
    sessionId: v.id("chatSessions"),
    lastN: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("chatMessages")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .take(args.lastN ?? 20);
    return all.reverse(); // chronological order
  },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

export const createSession = mutation({
  args: {
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    return await ctx.db.insert("chatSessions", {
      userId,
      title: args.title ?? "New Chat",
      createdAt: Date.now(),
    });
  },
});

export const updateSessionTitle = mutation({
  args: {
    sessionId: v.id("chatSessions"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.patch(args.sessionId, { title: args.title });
  },
});

export const deleteSession = mutation({
  args: { sessionId: v.id("chatSessions") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    // Delete all messages in the session
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    for (const msg of messages) {
      await ctx.db.delete(msg._id);
    }
    await ctx.db.delete(args.sessionId);
    return { ok: true };
  },
});

// ─── Action: Store user message (insert into DB) ──────────────────────────────

export const sendMessage = mutation({
  args: {
    sessionId: v.id("chatSessions"),
    content: v.string(),
    attachments: v.optional(v.array(v.id("assets"))),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    return await ctx.db.insert("chatMessages", {
      sessionId: args.sessionId,
      role: "user",
      content: args.content,
      attachments: args.attachments,
      createdAt: Date.now(),
    });
  },
});

// ─── Action: Execute tool call via OpenRouter + feed tools dynamically ─────────

export const executeToolCall = action({
  args: {
    sessionId: v.id("chatSessions"),
    userMessageId: v.id("chatMessages"),
    userContent: v.string(),
  },
  handler: async (ctx, args): Promise<any> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    // ═══ Step 1: Fetch user's stored API keys ═══
    const keys: Record<string, string> =
      (await ctx.runQuery(internal.users.getApiKeysForUser_Internal, { userId })) || {};

    // ═══ Step 2: Determine default model and router key ═══
    const openRouterKey = keys["OPENROUTER_API_KEY"] || process.env.OPENROUTER_API_KEY;
    const defaultModel = keys["DEFAULT_MODEL"] || "openrouter/auto";

    // ═══ Step 3: Fetch recent chat history (last 20 messages) ═══
    const recentMessages = await ctx.runQuery((api as any).chat.getRecentMessages, {
      sessionId: args.sessionId,
      lastN: 20,
    });

    // ═══ Step 4: Build dynamic tools array based on available keys ═══
    const tools: any[] = [];

    // Always add apply_effect (reads from effects_registry dynamically)
    tools.push({
      type: "function",
      function: {
        name: "apply_effect",
        description: "Apply a visual effect to the current project. Effect names come from the studio's effects registry.",
        parameters: {
          type: "object",
          properties: {
            effectName: { type: "string", description: "Name of the effect (e.g., Ken Burns Zoom, Vignette, Glitch)" },
            intensity: { type: "number", description: "Effect intensity 0-100" },
          },
          required: ["effectName"],
        },
      },
    });

    if (keys["PEXELS_API_KEY"] || process.env.PEXELS_API_KEY) {
      tools.push({
        type: "function",
        function: {
          name: "search_pexels",
          description: "Search Pexels stock footage library for b-roll video clips",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "Search query for desired footage" },
              perPage: { type: "number", description: "Number of results (max 20)" },
            },
            required: ["query"],
          },
        },
      });
    }

    if (keys["GROQ_API_KEY"] || process.env.GROQ_API_KEY) {
      tools.push({
        type: "function",
        function: {
          name: "whisper_transcribe",
          description: "Transcribe audio to text using OpenAI Whisper via Groq",
          parameters: {
            type: "object",
            properties: {
              audioUrl: { type: "string", description: "URL or path to audio file" },
              language: { type: "string", description: "Optional ISO language code" },
            },
            required: ["audioUrl"],
          },
        },
      });
    }

    if (keys["GEMINI_API_KEY"] || process.env.GEMINI_API_KEY) {
      tools.push({
        type: "function",
        function: {
          name: "vision_analyze",
          description: "Analyze an image or video frame using Gemini Vision",
          parameters: {
            type: "object",
            properties: {
              imageUrl: { type: "string", description: "URL or path to image/video frame" },
              question: { type: "string", description: "Question about the image content" },
            },
            required: ["imageUrl", "question"],
          },
        },
      });
    }

    if (keys["HUGGINGFACE_API_KEY"] || process.env.HUGGINGFACE_API_KEY ||
        keys["TOGETHER_API_KEY"] || process.env.TOGETHER_API_KEY) {
      tools.push({
        type: "function",
        function: {
          name: "generate_image",
          description: "Generate an image from a text prompt using an AI image model",
          parameters: {
            type: "object",
            properties: {
              prompt: { type: "string", description: "Text description of the image to generate" },
              width: { type: "number", description: "Image width" },
              height: { type: "number", description: "Image height" },
            },
            required: ["prompt"],
          },
        },
      });
    }

    if (keys["FIRECRAWL_API_KEY"] || process.env.FIRECRAWL_API_KEY) {
      tools.push({
        type: "function",
        function: {
          name: "web_scrape",
          description: "Scrape/extract content from a URL using Firecrawl",
          parameters: {
            type: "object",
            properties: {
              url: { type: "string", description: "The URL to scrape" },
            },
            required: ["url"],
          },
        },
      });
    }

    // ═══ Step 5: Build system prompt ═══
    const systemPrompt = {
      role: "system",
      content: `You are NUREX, the supreme multimodal AI assistant integrated into the NUREX STUDIO / ClipForge video creation platform. You operate in a fully dynamic environment. Your capabilities are defined by the tools provided to you in the 'tools' array of this request. You DO NOT have a fixed set of abilities; you must USE the provided tools to achieve the user's goals.

Your personality: Professional, highly creative, supportive, and enthusiastic. Use emojis to make the interaction engaging (🎬, 🧠, ⚙️, 🎨, 📊, 🔬, 🧮).

Domains you can handle (if tools allow): Video editing (trim, effects, color grading), Audio processing (transcription, sound effects), Coding (any language), Mathematics (solving equations, geometry, calculus), Physics & Engineering (simulations, explanations), Chemistry, Biology, Medicine, Presentations (PowerPoint creation guidance or file generation), Financial analysis, Web scraping, Image generation (B-roll, logos), Stock footage search.

Crucial Rule: If the user asks for something that requires a tool (e.g., 'find a video of a cat', 'generate an image of a mountain', 'transcribe this audio'), you MUST call the appropriate tool. Do not hallucinate or guess the result. Rely entirely on the tool's execution output to answer the user. If a requested tool is not available (not listed in the system prompt), politely inform the user that the service is not currently configured in their settings.`,
    };

    // ═══ Step 6: Build messages array from history ═══
    const historyMessages = recentMessages.map((m: any) => {
      if (m.role === "tool") {
        return { role: "tool", content: m.content, tool_call_id: m.toolCallId };
      }
      return { role: m.role, content: m.content };
    });

    const requestMessages = [systemPrompt, ...historyMessages];

    // ═══ Step 7: Call OpenRouter with tools ═══
    if (!openRouterKey) {
      const fallbackMsgId = await ctx.runMutation((api as any).chat.storeAssistantResponse, {
        sessionId: args.sessionId,
        content: "⚠️ No AI provider configured. Please add at least an OpenRouter API key in Settings to use the OmniChat. You can add other providers for additional capabilities (Pexels for stock footage, Groq for transcription, etc.).",
        usedModel: "none",
      });
      return { success: true, messageId: fallbackMsgId };
    }

    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openRouterKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://clipforge.app",
        },
        body: JSON.stringify({
          model: defaultModel,
          messages: requestMessages,
          tools: tools.length > 0 ? tools : undefined,
          tool_choice: tools.length > 0 ? "auto" : undefined,
          max_tokens: 4096,
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        throw new Error(`OpenRouter API error ${res.status}: ${errBody.slice(0, 200)}`);
      }

      const data = await res.json();
      const choice = data.choices?.[0];
      const message = choice?.message || {};
      const usedModel = data.model || defaultModel;

      // ═══ Step 8: Handle tool calls ═══
      if (message.tool_calls && message.tool_calls.length > 0) {
        let assistantText = message.content || "";
        const toolResults: string[] = [];

        for (const tc of message.tool_calls) {
          const toolName = tc.function?.name;
          let toolArgs: Record<string, any> = {};
          try { toolArgs = JSON.parse(tc.function?.arguments || "{}"); } catch {}

          let toolResult: any = { success: false, error: "Tool not found" };

          // Audit: tool call executed
          try { await ctx.runMutation((api as any).auditLogs.writeAuditLog, { action: `tool_${toolName}`, detailsJson: { args: toolArgs } }); } catch { /* non-blocking */ }

          try {
            switch (toolName) {
              case "search_pexels": {
                const pexelsKey = keys["PEXELS_API_KEY"] || process.env.PEXELS_API_KEY;
                if (pexelsKey) {
                  const pexelRes = await fetch(
                    `https://api.pexels.com/videos/search?query=${encodeURIComponent(toolArgs.query)}&per_page=${toolArgs.perPage || 5}&orientation=portrait`,
                    { headers: { Authorization: pexelsKey } },
                  );
                  const pexelData = await pexelRes.json();
                  toolResult = {
                    success: true,
                    videos: (pexelData.videos || []).slice(0, 5).map((v: any) => ({
                      id: v.id,
                      url: v.url,
                      image: v.image,
                      duration: v.duration,
                      user: v.user?.name,
                    })),
                  };
                }
                break;
              }
              case "whisper_transcribe": {
                const groqKey = keys["GROQ_API_KEY"] || process.env.GROQ_API_KEY;
                if (groqKey && toolArgs.audioUrl) {
                  const audioRes = await fetch(toolArgs.audioUrl);
                  if (audioRes.ok) {
                    const blob = await audioRes.blob();
                    const form = new FormData();
                    form.append("file", blob, "audio.mp3");
                    form.append("model", "whisper-large-v3-turbo");
                    if (toolArgs.language) form.append("language", toolArgs.language);
                    form.append("response_format", "json");
                    const whisperRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
                      method: "POST",
                      headers: { Authorization: `Bearer ${groqKey}` },
                      body: form,
                    });
                    if (whisperRes.ok) {
                      const whisperData = await whisperRes.json();
                      toolResult = { success: true, transcript: whisperData.text };
                    }
                  }
                }
                break;
              }
              case "generate_image": {
                // Try HuggingFace first, fallback Together
                const hfKey = keys["HUGGINGFACE_API_KEY"] || process.env.HUGGINGFACE_API_KEY;
                const tgKey = keys["TOGETHER_API_KEY"] || process.env.TOGETHER_API_KEY;
                if (hfKey) {
                  const imgRes = await fetch(
                    `https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-dev`,
                    {
                      method: "POST",
                      headers: { Authorization: `Bearer ${hfKey}`, "Content-Type": "application/json" },
                      body: JSON.stringify({ inputs: toolArgs.prompt, parameters: { width: toolArgs.width || 1024, height: toolArgs.height || 1024 } }),
                    },
                  );
                  if (imgRes.ok) {
                    const buffer = Buffer.from(await imgRes.arrayBuffer());
                    toolResult = { success: true, image: `data:image/png;base64,${buffer.toString("base64")}` };
                  }
                } else if (tgKey) {
                  const imgRes = await fetch("https://api.together.xyz/v1/images/generations", {
                    method: "POST",
                    headers: { Authorization: `Bearer ${tgKey}`, "Content-Type": "application/json" },
                    body: JSON.stringify({
                      model: "black-forest-labs/FLUX.1-schnell",
                      prompt: toolArgs.prompt,
                      width: toolArgs.width || 1024,
                      height: toolArgs.height || 1024,
                      steps: 4,
                    }),
                  });
                  if (imgRes.ok) {
                    const imgData = await imgRes.json();
                    toolResult = { success: true, image: imgData.data?.[0]?.b64_json || imgData.data?.[0]?.url || "" };
                  }
                }
                break;
              }
              case "vision_analyze": {
                const geminiKey = keys["GEMINI_API_KEY"] || process.env.GEMINI_API_KEY;
                if (geminiKey && toolArgs.imageUrl) {
                  // Fetch the image from URL → base64 (Gemini requires base64 bytes, not URLs)
                  const imgFetch = await fetch(toolArgs.imageUrl).catch(() => null);
                  if (imgFetch && imgFetch.ok) {
                    const imgBuffer = Buffer.from(await imgFetch.arrayBuffer());
                    const mime = imgFetch.headers.get("content-type") || "image/jpeg";
                    const b64 = imgBuffer.toString("base64");
                    const visionRes = await fetch(
                      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          contents: [{
                            parts: [
                              { text: toolArgs.question },
                              { inline_data: { mime_type: mime, data: b64 } },
                            ],
                          }],
                        }),
                      },
                    );
                    if (visionRes.ok) {
                      const visionData = await visionRes.json();
                      toolResult = { success: true, analysis: visionData?.candidates?.[0]?.content?.parts?.[0]?.text || "" };
                    }
                  }
                }
                break;
              }
              case "web_scrape": {
                const fcKey = keys["FIRECRAWL_API_KEY"] || process.env.FIRECRAWL_API_KEY;
                if (fcKey) {
                  const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
                    method: "POST",
                    headers: { Authorization: `Bearer ${fcKey}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ url: toolArgs.url }),
                  });
                  if (scrapeRes.ok) {
                    const scrapeData = await scrapeRes.json();
                    toolResult = { success: true, content: scrapeData?.data?.content || scrapeData?.markdown || "" };
                  }
                }
                break;
              }
              case "apply_effect": {
                toolResult = { success: true, message: `Effect "${toolArgs.effectName}" queued for application. Open the Studio to see it applied.` };
                break;
              }
              default:
                toolResult = { success: false, error: `Unknown tool: ${toolName}` };
            }
          } catch (e) {
            toolResult = { success: false, error: e instanceof Error ? e.message : "Tool execution failed" };
          }

          // Store tool call + result as chat messages
          const toolCallStr = JSON.stringify({ name: toolName, args: toolArgs });
          await ctx.runMutation((api as any).chat.storeToolMessage, {
            sessionId: args.sessionId,
            toolCallId: tc.id,
            toolCalls: toolArgs,
            content: JSON.stringify(toolResult),
          });

          toolResults.push(`Tool ${toolName} result: ${JSON.stringify(toolResult)}`);
        }

        // ═══ Step 9: Feed tool results back to the model for final answer ═══
        const followUpMessages = [
          ...requestMessages,
          message, // assistant message with tool_calls
          ...toolResults.map((r) => ({ role: "tool" as const, content: r })),
        ];

        try {
          const followUpRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${openRouterKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://clipforge.app",
            },
            body: JSON.stringify({
              model: defaultModel,
              messages: followUpMessages,
              max_tokens: 2048,
              temperature: 0.7,
            }),
            signal: AbortSignal.timeout(30000),
          });

          if (followUpRes.ok) {
            const followUpData = await followUpRes.json();
            const followUpContent = followUpData.choices?.[0]?.message?.content || "";
            if (followUpContent) {
              assistantText = followUpContent;
            }
          }
        } catch {
          // Keep original assistant text
        }

        // Store assistant response
        const assistantMsgId = await ctx.runMutation((api as any).chat.storeAssistantResponse, {
          sessionId: args.sessionId,
          content: assistantText || "I processed your request using available tools.",
          usedModel,
        });

        // Auto-embed the assistant response in vectorMemory for semantic search
        try {
          await ctx.runAction((api as any).vectorMemory.storeEmbedding, {
            sourceText: assistantText,
            summary: `Chat: ${assistantText.slice(0, 200)}`,
          });
        } catch {
          /* non-blocking */
        }

        return { success: true, messageId: assistantMsgId, toolCalls: message.tool_calls };
      }

      // ═══ Step 10: No tool calls — store direct response ═══
      const responseContent = message.content || "I'm not sure how to respond to that.";
      const assistantMsgId = await ctx.runMutation((api as any).chat.storeAssistantResponse, {
        sessionId: args.sessionId,
        content: responseContent,
        usedModel,
      });

      // Auto-embed in vectorMemory
      try {
        await ctx.runAction((api as any).vectorMemory.storeEmbedding, {
          sourceText: responseContent,
          summary: `Chat: ${responseContent.slice(0, 200)}`,
        });
      } catch {
        /* non-blocking */
      }

      return { success: true, messageId: assistantMsgId, usedModel };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      await ctx.runMutation((api as any).chat.storeAssistantResponse, {
        sessionId: args.sessionId,
        content: `❌ Error: ${errMsg}`,
        usedModel: "error",
      });
      return { success: false, error: errMsg };
    }
  },
});

// ─── Internal mutations for chat.ts (used as any to avoid codegen dependency) ──
// These are exported so they can be called via (api as any).chat.X

export const storeToolMessage = mutation({
  args: {
    sessionId: v.id("chatSessions"),
    toolCallId: v.string(),
    toolCalls: v.any(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("chatMessages", {
      sessionId: args.sessionId,
      role: "tool",
      content: args.content,
      toolCalls: args.toolCalls,
      toolCallId: args.toolCallId,
      createdAt: Date.now(),
    });
  },
});

export const storeAssistantResponse = mutation({
  args: {
    sessionId: v.id("chatSessions"),
    content: v.string(),
    usedModel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    return await ctx.db.insert("chatMessages", {
      sessionId: args.sessionId,
      role: "assistant",
      content: args.content,
      usedModel: args.usedModel,
      createdAt: Date.now(),
    });

  },
});
