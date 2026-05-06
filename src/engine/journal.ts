// End-of-session journal prompts. Strategy doc §6 step 4: 3 short prompts.

/**
 * Returns the three reflection prompts shown at the end of every session.
 * Identical, deterministic ordering by design — repetition builds the habit.
 */
export function endOfSessionPrompts(): string[] {
  return [
    "What did I learn this session?",
    "What was my biggest mistake — and what was I thinking when I made it?",
    "One thing I'll do differently next session.",
  ];
}
