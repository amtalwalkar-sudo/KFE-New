import {
  KFE_SHELL_SELECTION_KEY,
  KFE_SHELL_NAMES,
  normalizeShellName,
} from './shell-contract.js';
import { getShell } from './shell-registry.js';
import {
  readKfeShellSelection,
  persistKfeShellSelection,
} from './shell-selection.js';

function safePersist(name) {
  try {
    return persistKfeShellSelection(KFE_SHELL_SELECTION_KEY, name);
  } catch {
    return name;
  }
}

function readSelection() {
  const runtime = normalizeShellName(globalThis.KFE_UI_SHELL);
  if (runtime) return runtime;

  const buildTime = normalizeShellName(import.meta.env?.VITE_KFE_UI_SHELL);
  if (buildTime) return buildTime;

  try {
    const stored = normalizeShellName(readKfeShellSelection(KFE_SHELL_SELECTION_KEY));
    if (stored) return stored;
  } catch {
    // Fall through to the deterministic production default.
  }

  return KFE_SHELL_NAMES.CURRENT;
}

export function resolveKfeShell() {
  const requested = readSelection();
  const requestedShell = getShell(requested);
  const fallbackShell = getShell(KFE_SHELL_NAMES.CURRENT);
  const shell = requestedShell ?? fallbackShell;

  if (!shell) {
    throw new Error('KFE current shell is not registered.');
  }

  return Object.freeze({
    requested,
    resolved: shell.name,
    shell,
    fallback: requested !== shell.name,
  });
}

export function selectKfeShell(name) {
  const normalized = normalizeShellName(name);
  if (!normalized || !getShell(normalized)) {
    throw new Error(`Unknown KFE shell: ${name}`);
  }
  return safePersist(normalized);
}
