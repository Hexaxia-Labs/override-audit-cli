import { chalk } from "./chalk.js";
import { pluralize } from "./string.js";

export function formatAdvisoryDbFreshness(lastSyncAt: string | null): string {
  if (!lastSyncAt) {
    return chalk.yellow("unknown");
  }

  const timestamp = Date.parse(lastSyncAt);
  if (Number.isNaN(timestamp)) {
    return chalk.yellow("unknown");
  }

  return `${relativeAge(timestamp)} ${chalk.gray(`(${lastSyncAt})`)}`;
}

export function relativeAge(timestamp: number): string {
  const deltaMs = Math.max(0, Date.now() - timestamp);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (deltaMs < minute) {
    return "just synced";
  }
  if (deltaMs < hour) {
    const minutes = Math.floor(deltaMs / minute);
    return `synced ${minutes} ${pluralize(minutes, "minute")} ago`;
  }
  if (deltaMs < day) {
    const hours = Math.floor(deltaMs / hour);
    return `synced ${hours} ${pluralize(hours, "hour")} ago`;
  }

  const days = Math.floor(deltaMs / day);
  return `synced ${days} ${pluralize(days, "day")} ago`;
}
