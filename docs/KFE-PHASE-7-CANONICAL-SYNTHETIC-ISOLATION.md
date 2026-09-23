# KFE Phase 7 — Canonical ↔ Synthetic Isolation

## 7A — Source selection
The active repository boundary resolves to either the canonical IndexedDB or the physical synthetic IndexedDB. Switching sources closes cached connections and clears initialization state before the next repository operation.

## 7B — CRUD isolation
Admin source-record CRUD follows the active data source. Canonical mutations stay canonical; synthetic test mutations stay synthetic. Synthetic mutations do not enter the canonical cross-tab notification path.

## 7C — Reset and reload
Clearing Synthetic Mode clears every synthetic store, including settlements, then restores canonical mode. Reloading after the switch must preserve canonical records and must not expose synthetic records.

## 7D — Calculation isolation
Performance calculations consume the currently active repository. The five-year synthetic dataset must still produce the frozen operating-KM forecast of 212.21168510607765 km/day and multiplier of 1.0610584255303882× without canonical records being visible.

## 7E — Physical DB proof
Both physical databases remain distinct. Repeated load → CRUD → reset → reload → load cycles must not copy records across databases.

## Exit criteria
- active-source-aware Admin persistence
- no canonical record visible in Synthetic Mode
- no synthetic record visible in Canonical Mode
- synthetic CRUD survives within the synthetic DB until reset
- reset restores Canonical Mode
- repeated switching/reload remains isolated
- five-year synthetic calculations remain intact
- CI runtime gate and architecture contract are green
