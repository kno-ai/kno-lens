import * as vscode from "vscode";
import type { SummaryConfig } from "@kno-lens/view";

export function getSummaryConfig(): Partial<SummaryConfig> {
  const cfg = vscode.workspace.getConfiguration("knoLens.summary");
  const result: Partial<SummaryConfig> = {};

  const importance = cfg.get<SummaryConfig["defaultMinImportance"]>("defaultMinImportance");
  if (importance != null) result.defaultMinImportance = importance;

  const group = cfg.get<boolean>("groupConsecutive");
  if (group != null) result.groupConsecutive = group;

  const maxItems = cfg.get<number>("maxVisibleItems");
  if (maxItems != null) result.maxVisibleItems = maxItems;

  const maxTurns = cfg.get<number>("maxVisibleTurns");
  if (maxTurns != null) result.maxVisibleTurns = maxTurns;

  return result;
}

export function getThrottleMs(): number {
  return vscode.workspace.getConfiguration("knoLens").get("throttleMs", 100);
}
