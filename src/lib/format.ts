export const fmtChips = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 0 });

export const fmtPct = (p: number, digits = 0) =>
  `${(p).toFixed(digits)}%`;

export const fmtBB = (chips: number, bb: number) =>
  bb > 0 ? `${(chips / bb).toFixed(1)}bb` : "—";
