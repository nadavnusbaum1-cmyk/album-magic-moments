import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Israeli/European day-first date display: dd/mm/yyyy (en-GB gives exactly that).
export const formatDMY = (d?: string | null) => (d ? new Date(d).toLocaleDateString("en-GB") : "");
