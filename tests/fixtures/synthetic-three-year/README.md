# Three-year synthetic KFE calculation fixture

**Synthetic test data only. It is not copied from the installed PWA and must never be imported into production storage.**

This directory contains a deterministic generator, not production application logic. Running it writes to a separate local output directory (default: `tmp/synthetic-kfe-fixture/`), with no browser APIs, IndexedDB, localStorage, or service-worker access.

## Generate the records

```sh
node tests/fixtures/synthetic-three-year/generate-fixture.cjs
```

Optional separate output path:

```sh
node tests/fixtures/synthetic-three-year/generate-fixture.cjs /tmp/kfe-synthetic
```

The generated `fixture.json` contains 1,096 daily synthetic records for 2023–2025, 36 monthly rollups, and named special-case oracles. Inputs include 200 km/day, fuel ₹3.20/km, ongoing maintenance provision ₹1.60/km, EMI ₹11,324/month, compliance ₹30,000/year, and the separate pre-business maintenance obligation of 60,000 km × ₹0.60/km = ₹36,000.

## Evidence discipline

For each PWA calculation test, record: fixture/scenario ID, selected period, exact inputs, expected result, canonical calculation output, rendered/displayed value, and pass/fail. A known expected total is not enough to claim the source breakdown reconciles.

The ₹815 provisional total and ₹4,672 break-even reference are deliberately marked as output-only oracles because their component/source inputs are not specified here. Loan EMI payments can be totaled, but principal reconciliation is not marked passed without a principal, interest rate, and original tenure. Do not invent these inputs.

## Isolation

The generator writes only files under its output directory. It does not import PWA modules, seed app data, or touch browser storage. The fixture folder itself is outside the runtime data path; keep it test-only.
