import {
  assertShellContract,
  KFE_SHELL_CONTRACT_VERSION,
  KFE_SHELL_NAMES,
} from './shell-contract.js';
import CurrentShell from './shells/current/CurrentShell.vue';

const registry = new Map();

function registerShell(shell) {
  assertShellContract(shell);
  if (registry.has(shell.name)) {
    throw new Error(`KFE shell "${shell.name}" is already registered.`);
  }
  registry.set(shell.name, Object.freeze({
    ...shell,
    metadata: Object.freeze({
      role: 'driver-centric-pwa-shell',
      interaction: 'mounted-mobile-single-hand',
      darkModeDefault: true,
      minimumTouchTarget: 56,
      glanceScale: 1.5,
      offlineFirst: true,
      contractVersion: KFE_SHELL_CONTRACT_VERSION,
      ...(shell.metadata || {}),
    }),
  }));
}

registerShell({
  name: KFE_SHELL_NAMES.CURRENT,
  contractVersion: KFE_SHELL_CONTRACT_VERSION,
  component: CurrentShell,
});

export function getShell(name) {
  return registry.get(name) ?? null;
}

export function listShells() {
  return Object.freeze([...registry.values()]);
}

export function registerKfeShell(shell) {
  registerShell(shell);
  return getShell(shell.name);
}
