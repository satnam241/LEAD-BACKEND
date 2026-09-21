"use strict";
// utils/blastupGroups.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.STATUS_GROUP_MAP = void 0;
exports.groupForStatus = groupForStatus;
exports.groupForDate = groupForDate;
exports.STATUS_GROUP_MAP = {
    new: "lead-new",
    contacted: "lead-contacted",
    interested: "lead-interested",
    negotiation: "lead-negotiation",
    visitor: "lead-visitor",
    closed: "lead-closed",
    lost: "lead-lost",
};
function groupForStatus(status) {
    const key = (status || "new").toLowerCase();
    return exports.STATUS_GROUP_MAP[key] || "lead-new";
}
function groupForDate(date, mode) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    if (mode === "month")
        return `leads-${y}-${m}`;
    const d = String(date.getDate()).padStart(2, "0");
    return `leads-${y}-${m}-${d}`;
}
//# sourceMappingURL=blastupGroups.js.map