# KFE Phase 6 — Five-Year Synthetic Runtime Validation

## Purpose
Validate the complete five-year synthetic dataset through the real application boundary, not only isolated calculation fixtures.

## Frozen dataset
- Business period: 1 May 2026 → 30 April 2031
- Daily shifts: 1,826
- Completed trips: 8,951
- One synthetic vehicle and driver
- One synthetic loan
- No synthetic EMI payments or prepayments
- Synthetic data is stored in kanishka_kfe_synthetic_db

## 6A — Load through the application
The runtime gate opens the production build, navigates to Admin → Synthetic Data, and selects 5 years. This exercises the same SyntheticDataService.loadSyntheticStage('fiveYears') flow used by the app.

## 6B — Physical database validation
The gate verifies the synthetic IndexedDB exists, is the active source, contains the expected five-year stores/counts, and is distinct from the canonical database.

## 6C — Full calculation path
The loaded history is read by the real Performance service and passed through the operating-KM forecast, finance-aware performance, Driver Target, and financial-fact paths.

## 6D — Frozen numerical reconciliation
The runtime result must expose:
- operating-KM forecast: 212.21168510607765 km/day (displayed to 4 decimals as 212.2117 KM/day)
- KM → Driver Target multiplier: 1.0610584255303882× (displayed to 6 decimals as 1.061058×)
- 1,826 observed operating days
- 8,951 trips
- actual/indicative profit identities remain internally consistent.

## 6E — Visible UI verification
The gate visits Work, Timeline, Performance, and Admin while Synthetic Mode is active. Performance must visibly expose the same frozen forecast and multiplier calculated from the loaded history.

## 6F — Runtime safety
The gate checks browser page errors, failed requests, horizontal overflow, mobile/desktop viewports, and confirms that manual forecast override UI remains hidden.

## Exit criteria
Phase 6 is complete only when:
1. the production app can load the five-year dataset through its UI;
2. the physical synthetic DB contains the full dataset;
3. the real calculation services produce the frozen values;
4. the visible Performance UI exposes those values;
5. canonical and synthetic DBs remain separate;
6. runtime safety checks pass in CI.


CI gate activation: Phase 6 runtime verification is executed by consolidated-baseline CI.
