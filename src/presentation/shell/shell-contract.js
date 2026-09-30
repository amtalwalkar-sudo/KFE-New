export const KFE_SHELL_CONTRACT_VERSION = '1.0.0';

export const KFE_SHELL_SELECTION_KEY = 'kfe:ui-shell';

export const KFE_SHELL_NAMES = Object.freeze({
  CURRENT: 'current',
  DRIVER: 'driver',
});

export function normalizeShellName(value) {
  const name = String(value ?? '').trim().toLowerCase();
  return Object.values(KFE_SHELL_NAMES).includes(name) ? name : null;
}

export function assertShellContract(shell) {
  if (!shell || typeof shell !== 'object') {
    throw new TypeError('KFE shell must be an object.');
  }
  if (!shell.name || typeof shell.name !== 'string') {
    throw new TypeError('KFE shell must expose a name.');
  }
  if (typeof shell.component !== 'object' && typeof shell.component !== 'function') {
    throw new TypeError(`KFE shell "${shell.name}" must expose a Vue component.`);
  }
  if (shell.contractVersion !== KFE_SHELL_CONTRACT_VERSION) {
    throw new TypeError(`KFE shell "${shell.name}" has an unsupported contract version.`);
  }
  return shell;
}
