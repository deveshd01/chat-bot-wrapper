# Chat Bot Wrapper

Ask many AI models the same question at once, then let a **master model** merge their answers into one.

1. Open **⚙ Settings** and save API keys for any of: ChatGPT (OpenAI), Claude (Anthropic), Gemini, Grok (xAI), Mistral, Groq, DeepSeek, OpenRouter — or add any OpenAI-compatible endpoint.
2. Type a question; optionally attach an image (button, paste, or drag & drop).
3. Every enabled model with a key answers in parallel.
4. The master model (selectable; defaults to the first model with a key) summarizes them.
   If the question is an MCQ, it returns **only the correct option**.
5. Change the master model and click **↻ Re-summarize** to redo the final answer without re-asking everyone.

Model names are editable per provider. Keys are stored in `localStorage` and sent only to their own provider, straight from the browser.

```bash
npm install
npm run dev
```
