import { useMemo } from "react";
import { en, type Dict } from "./en";
import { pt } from "./pt";
import { useStore, type Lang } from "../state/store";
import type { FurnitureItem, Issue } from "../model/types";

export type TKey = keyof Dict;
export type T = (key: TKey, params?: Record<string, string | number>) => string;

const DICTS: Record<Lang, Dict> = { en, pt };

export function makeT(lang: Lang): T {
  const d = DICTS[lang];
  return (key, params) => {
    const s = d[key] ?? en[key] ?? key;
    return params ? s.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`)) : s;
  };
}

export function useT(): T {
  const lang = useStore((s) => s.lang);
  return useMemo(() => makeT(lang), [lang]);
}

export function itemName(item: FurnitureItem, t: T): string {
  if (item.name) return item.name;
  if (item.presetId && `preset.${item.presetId}` in en) return t(`preset.${item.presetId}` as TKey);
  return t(`cat.${item.category}` as TKey);
}

export function issueText(issue: Issue, items: FurnitureItem[], t: T): string {
  const byId = (id: string | number) => {
    const it = items.find((i) => i.id === id);
    return it ? itemName(it, t) : String(id);
  };
  const p = issue.params;
  let key = `issue.${issue.code}`;
  if (p.variant) key += `.${p.variant}`;
  else if (issue.code === "doorBlocked" && Number(p.more) > 0) key += ".more";
  return t(key as TKey, { ...p, a: byId(p.a), ...(p.b !== undefined ? { b: byId(p.b) } : {}) });
}
