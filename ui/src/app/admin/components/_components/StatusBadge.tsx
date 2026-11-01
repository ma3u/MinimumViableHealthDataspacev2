"use client";

import { STATUS_COLORS } from "./constants";
import { useT } from "@/lib/i18n/translate";

export function StatusBadge({ status }: { status: string }) {
  const t = useT("admin");
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={`w-2 h-2 rounded-full ${
          STATUS_COLORS[status] || STATUS_COLORS.unknown
        }`}
      />
      <span className="text-xs capitalize">{t(status)}</span>
    </span>
  );
}
