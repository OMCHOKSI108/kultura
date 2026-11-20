import type { ThinkingStep, Message } from "@/types/chat";

export const MOCK_THINKING_STEPS: ThinkingStep[] = [
  { id: "t1", text: "Parsing the user's request and identifying key intent..." },
  { id: "t2", text: "Retrieving relevant context and reasoning about constraints..." },
  { id: "t3", text: "Composing a clear, structured response..." },
];

const MOCK_REPLIES = [
  `Sure! Here's a quick breakdown:\n\n**Key Points**\n- This is a frontend-only mock right now.\n- When you wire up the server, replace this file with a real \`fetch\` call.\n- The UI will stream responses exactly the same way.\n\nLet me know what you'd like to build next.`,
  `Great question. Here's how I'd approach it:\n\n1. Start with a clear data model.\n2. Keep each component under 200 lines.\n3. Separate concerns — UI, state, and utilities live in different folders.\n\nThis keeps the codebase easy to reason about as it grows.`,
  `I can help with that. The pattern you're looking for is a **custom hook** that manages:\n- Local state for messages\n- An async function that simulates (or later calls) the backend\n- A streaming update loop via \`setTimeout\` or SSE\n\nWant me to sketch out the full implementation?`,
  `Noted. The \`NEXT_PUBLIC_SERVER_URL\` in your root \`.env\` is already wired into \`src/lib/env.ts\`. When your \`server/\` is ready, just update that URL and swap the mock in \`mock-response.ts\` for a real fetch.`,
];

export function getMockReply(prompt: string): string {
  return MOCK_REPLIES[prompt.length % MOCK_REPLIES.length];
}

export const THINKING_DURATION_MS = 2200;
export const STEP_INTERVAL_MS = 650;

/** Pre-built mock history sessions with full messages */
export function getMockSessions() {
  const makeSession = (id: string, title: string, userMsg: string, replyIdx: number): import("@/types/chat").ChatSession => ({
    id,
    title,
    preview: MOCK_REPLIES[replyIdx].slice(0, 60) + "...",
    timestamp: new Date(Date.now() - Math.random() * 1e9),
    messages: [
      { id: `${id}-u1`, role: "user", content: userMsg },
      {
        id: `${id}-a1`, role: "assistant", content: MOCK_REPLIES[replyIdx],
        thinkingSteps: MOCK_THINKING_STEPS, thinkingDuration: 2100,
      },
    ] as Message[],
  });

  return [
    makeSession("s1", "Build a REST API", "How do I build a simple REST API?", 0),
    makeSession("s2", "Explain React hooks", "Can you explain React hooks to me?", 1),
    makeSession("s3", "Debug my Tailwind config", "My Tailwind config isn't working, help!", 2),
    makeSession("s4", "Design a database schema", "How should I design a database schema for a chat app?", 3),
  ];
}
