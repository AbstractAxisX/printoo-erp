// Time range presets and helpers for dashboard KPIs

export type TimeRange = { from: Date; to: Date; label: string; preset: string };

export const RANGE_PRESETS: { id: string; label: string; getRange: () => TimeRange }[] = [
  {
    id: "today",
    label: "امروز",
    getRange: () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { from, to: now, label: "امروز", preset: "today" };
    },
  },
  {
    id: "yesterday",
    label: "دیروز",
    getRange: () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59);
      return { from, to, label: "دیروز", preset: "yesterday" };
    },
  },
  {
    id: "this-week",
    label: "این هفته",
    getRange: () => {
      const now = new Date();
      const from = new Date(now);
      from.setDate(now.getDate() - now.getDay()); // start of week (Sunday)
      from.setHours(0, 0, 0, 0);
      return { from, to: now, label: "این هفته", preset: "this-week" };
    },
  },
  {
    id: "last-week",
    label: "هفته قبل",
    getRange: () => {
      const now = new Date();
      const thisWeekStart = new Date(now);
      thisWeekStart.setDate(now.getDate() - now.getDay());
      thisWeekStart.setHours(0, 0, 0, 0);
      const from = new Date(thisWeekStart);
      from.setDate(thisWeekStart.getDate() - 7);
      const to = new Date(thisWeekStart);
      to.setSeconds(-1);
      return { from, to, label: "هفته قبل", preset: "last-week" };
    },
  },
  {
    id: "this-month",
    label: "این ماه",
    getRange: () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from, to: now, label: "این ماه", preset: "this-month" };
    },
  },
  {
    id: "last-month",
    label: "ماه قبل",
    getRange: () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      return { from, to, label: "ماه قبل", preset: "last-month" };
    },
  },
  {
    id: "last-3-months",
    label: "۳ ماه اخیر",
    getRange: () => {
      const now = new Date();
      const from = new Date(now);
      from.setMonth(now.getMonth() - 3);
      return { from, to: now, label: "۳ ماه اخیر", preset: "last-3-months" };
    },
  },
  {
    id: "this-year",
    label: "امسال",
    getRange: () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), 0, 1);
      return { from, to: now, label: "امسال", preset: "this-year" };
    },
  },
  {
    id: "all-time",
    label: "همه زمان‌ها",
    getRange: () => {
      const from = new Date(2000, 0, 1);
      return { from, to: new Date(), label: "همه زمان‌ها", preset: "all-time" };
    },
  },
];

export function getPreset(id: string): TimeRange {
  const p = RANGE_PRESETS.find((r) => r.id === id);
  return p ? p.getRange() : RANGE_PRESETS[4].getRange(); // default this month
}

export function customRange(from: Date, to: Date): TimeRange {
  const f = new Date(from);
  f.setHours(0, 0, 0, 0);
  const t = new Date(to);
  t.setHours(23, 59, 59, 999);
  const diffDays = Math.round((t.getTime() - f.getTime()) / 86400000);
  let label = "بازه دلخواه";
  if (diffDays === 0) label = "یک روز";
  else if (diffDays === 6) label = "۷ روز";
  else if (diffDays === 29) label = "۳۰ روز";
  return { from: f, to: t, label, preset: "custom" };
}

export function rangeToParams(r: TimeRange): string {
  return `from=${r.from.toISOString()}&to=${r.to.toISOString()}`;
}
