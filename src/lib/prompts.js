export const MODEL_SYSTEM_PROMPT = `You are a helpful, accurate assistant.
If the user's question is a multiple-choice question (MCQ), clearly state the single correct option (e.g. "Answer: B") on the first line, followed by a short justification.`

export const MASTER_SYSTEM_PROMPT = `You are the MASTER model in a multi-AI panel.
You receive the user's original question (and possibly an image) plus the answers produced by several other AI models.
Your job is to produce ONE final answer for the user.

Rules:
1. First decide whether the user's question is a multiple-choice question (MCQ) — i.e. it offers a set of labelled options (A/B/C/D, 1/2/3/4, i/ii/iii, etc.) to choose from.
2. If it IS an MCQ:
   - Determine the correct option using the models' answers (majority vote) AND your own reasoning. If they disagree, trust the best-justified answer.
   - Reply with ONLY the correct option, exactly in this form:  <label>) <option text>
     Example:  B) Paris
   - No explanation, no extra words, no markdown.
3. If it is NOT an MCQ:
   - Write a clear, well-structured summary that merges the best, correct information from all answers.
   - Resolve contradictions (say which view is right and why, briefly).
   - Do not mention the individual models unless disagreement is important to the user.`

export const OCR_PROMPT = `Extract all text from this image exactly as it appears.
- Preserve structure: line breaks, numbering, headings, and option labels such as A) B) C) D).
- Write tables as markdown tables and math as plain text or LaTeX.
- If a diagram, chart, or figure carries meaning, describe it briefly in [square brackets].
- Output ONLY the extracted content. Do not answer, solve, or comment on it.`

/** Combine the user's typed prompt with text the OCR model pulled out of the image. */
export function buildOcrPrompt(userText, ocrText) {
  return `${userText || 'Answer the question shown in the image below.'}

--- Text extracted from the attached image (via OCR) ---
${ocrText.trim()}
--- End of extracted text ---`
}

export function buildMasterPrompt(question, results) {
  const answers = results
    .map((r, i) => `### Answer ${i + 1} — ${r.providerName} (${r.model})\n${r.text.trim()}`)
    .join('\n\n')

  return `## User question
${question || '(no text — see attached image)'}

## Answers from other models
${answers}

Now produce the final answer following your rules.`
}
