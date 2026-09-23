# KFE Phase 7 — Canonical ↔ Synthetic Isolation

## Purpose
Prove that canonical and synthetic are two physical, switchable application data worlds. Normal business repositories follow the active source; synchronization and backup lifecycle remain canonical-only.

## 7A — Physical separation
Canonical and synthetic use distinct IndexedDB names and schema versions. Switching closes cached connections before the next source is opened.

## 7B — Active-source repository routing
Normal Admin, Performance, Work, Fuel, Shift/Trip, and Location repositories use the active-source storage boundary. Sync mutation lifecycle and backup/restore lifecycle remain explicitly canonical.

## 7C — CRUD isolation
A record created through the normal Admin repository while Synthetic is active is visible in Synthetic and absent after switching to Canonical. A canonical marker remains absent from Synthetic.

## 7D — Reload persistence
The selected source is tab-local and survives a page reload. Synthetic records and calculations remain available after reload.

## 7E — Calculation isolation
Performance reads the active database. Switching source changes the calculation input set without copying records between physical databases.

## 7F — No leakage
Canonical stores never receive synthetic CRUD records; synthetic stores never receive canonical records or canonical sync queue state.

## Exit criteria
All six boundaries pass in CI with a real browser and real IndexedDB.
