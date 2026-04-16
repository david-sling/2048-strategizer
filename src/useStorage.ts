/**
 * useStorage.ts — localStorage persistence for saved strategies.
 */

import { useState } from "react";
import { LS_KEY } from "./constants.ts";

export interface SavedStrategy {
  name: string;
  code: string;
}

export function lsLoad(): SavedStrategy[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]") as SavedStrategy[];
  } catch {
    return [];
  }
}

export function lsSave(list: SavedStrategy[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  } catch {
    /* quota exceeded – silently ignore */
  }
}

/**
 * Hook that manages the saved-strategies list.
 * Returns { savedStrategies, saveStrategy, deleteStrategy }.
 */
export function useStoredStrategies(): {
  savedStrategies: SavedStrategy[];
  saveStrategy: (name: string, code: string) => void;
  deleteStrategy: (name: string) => void;
} {
  const [savedStrategies, setSavedStrategies] = useState<SavedStrategy[]>(lsLoad);

  function saveStrategy(name: string, code: string): void {
    const updated = [
      ...savedStrategies.filter((s) => s.name !== name),
      { name, code },
    ];
    setSavedStrategies(updated);
    lsSave(updated);
  }

  function deleteStrategy(name: string): void {
    const updated = savedStrategies.filter((s) => s.name !== name);
    setSavedStrategies(updated);
    lsSave(updated);
  }

  return { savedStrategies, saveStrategy, deleteStrategy };
}
