/**
 * useStorage.js — localStorage persistence for saved strategies.
 */

import { useState } from "react";
import { LS_KEY } from "./constants.js";

export function lsLoad() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); }
  catch { return []; }
}

export function lsSave(list) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(list)); }
  catch { /* quota exceeded – silently ignore */ }
}

/**
 * Hook that manages the saved-strategies list.
 * Returns { savedStrategies, saveStrategy, deleteStrategy }.
 */
export function useStoredStrategies() {
  const [savedStrategies, setSavedStrategies] = useState(lsLoad);

  function saveStrategy(name, code) {
    const updated = [
      ...savedStrategies.filter((s) => s.name !== name),
      { name, code },
    ];
    setSavedStrategies(updated);
    lsSave(updated);
  }

  function deleteStrategy(name) {
    const updated = savedStrategies.filter((s) => s.name !== name);
    setSavedStrategies(updated);
    lsSave(updated);
  }

  return { savedStrategies, saveStrategy, deleteStrategy };
}
