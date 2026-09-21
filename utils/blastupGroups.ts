// utils/blastupGroups.ts

export const STATUS_GROUP_MAP: Record<string, string> = {
  new: "lead-new",
  contacted: "lead-contacted",
  interested: "lead-interested",
  negotiation: "lead-negotiation",
  visitor: "lead-visitor",
  closed: "lead-closed",
  lost: "lead-lost",
};

export function groupForStatus(status?: string): string {
  const key = (status || "new").toLowerCase();
  return STATUS_GROUP_MAP[key] || "lead-new";
}

export function groupForDate(date: Date, mode: "month" | "day"): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  if (mode === "month") return `leads-${y}-${m}`;
  const d = String(date.getDate()).padStart(2, "0");
  return `leads-${y}-${m}-${d}`;
}