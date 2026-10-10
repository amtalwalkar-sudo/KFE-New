#!/usr/bin/env node
/**
 * Synthetic-only KFE calculation fixture generator.
 *
 * This module has no browser, IndexedDB, localStorage, service-worker, or PWA imports.
 * It only writes JSON files beneath the explicitly supplied output directory.
 * Default output: ./tmp/synthetic-kfe-fixture (ignored/local test output; not app storage).
 */
const fs = require("node:fs");
const path = require("node:path");

const START = new Date("2023-01-01T00:00:00.000Z");
const END = new Date("2025-12-31T00:00:00.000Z");
const INR = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const iso = (d) => d.toISOString().slice(0, 10);
const daysInYear = (year) => new Date(Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000;

function generate() {
  const daily = [];
  const monthly = [];
  const tripScenarios = [
    {
      id: "TRIP-MISSING-KM-001",
      synthetic: true,
      date: "2024-06-15",
      operator: "Synthetic Operator A",
      fareInr: 420,
      tripKm: null,
      expected: {
        missingTripKmWarning: true,
        missingKmMustNotBecomeZero: true,
        warningMustSurviveRefreshAndReconciliation: true
      }
    }
  ];

  const byMonth = new Map();
  for (let d = new Date(START); d <= END; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = iso(d);
    const km = 200; // exact calendar-day baseline, including weekends
    const month = date.slice(0, 7);
    const fuel = INR(km * 3.2);
    const maintenanceProvision = INR(km * 1.6);
    // Each annual compliance record spans Jan 1–Dec 31 in its calendar year.
    // Accrue over actual covered calendar days (365 or 366), without daily rounding.
    const complianceProvision = 30000 / daysInYear(d.getUTCFullYear());
    const emiPayment = d.getUTCDate() === 1 ? 11324 : 0;
    const record = {
      id: `DAY-${date}`,
      synthetic: true,
      date,
      businessStartDate: "2023-01-01", // fixture assumption, not asserted as real business setup
      totalKm: km,
      fuelCostPerKmInr: 3.2,
      fuelCostInr: fuel,
      maintenanceProvisionPerKmInr: 1.6,
      maintenanceProvisionInr: maintenanceProvision,
      complianceAnnualInr: 30000,
      complianceProvisionInr: complianceProvision,
      emiPaymentInr: emiPayment,
      sourceTag: "SYNTHETIC_FIXTURE_ONLY"
    };
    daily.push(record);
    if (!byMonth.has(month)) byMonth.set(month, {
      month, synthetic: true, operatingDays: 0, totalKm: 0,
      fuelCostInr: 0, maintenanceProvisionInr: 0,
      complianceProvisionInr: 0, emiPaymentInr: 0
    });
    const m = byMonth.get(month);
    m.operatingDays += 1;
    m.totalKm += km;
    m.fuelCostInr = INR(m.fuelCostInr + fuel);
    m.maintenanceProvisionInr = INR(m.maintenanceProvisionInr + maintenanceProvision);
    m.complianceProvisionInr += complianceProvision;
    m.emiPaymentInr = INR(m.emiPaymentInr + emiPayment);
  }
  for (const month of byMonth.values()) month.complianceProvisionInr = INR(month.complianceProvisionInr);
  monthly.push(...byMonth.values());

  const specialCases = {
    synthetic: true,
    targetSurplus: {
      id: "TARGET-SURPLUS-001",
      date: "2024-06-15",
      requiredTargetInr: 1000,
      earnedEligibleAmountInr: 1350,
      expectedDailyTargetInr: 0,
      expectedSurplusCreditInr: 350,
      expectedInvariant: "dailyTarget >= 0; surplus is stored separately, not as a negative target"
    },
    loan: {
      id: "LOAN-RECON-001",
      monthlyEmiInr: 11324,
      paymentCountInThreeYears: 36,
      expectedTotalPaidInr: 407664,
      principalInr: null,
      annualInterestRatePercent: null,
      originalTenureMonths: null,
      expectedInvariant: "paid EMI count + remaining EMI count = configured original tenure; outstanding principal must match amortization schedule",
      status: "PARTIAL_ORACLE_ONLY",
      note: "EMI and payments are grounded in the stated baseline; principal, interest rate and original tenure were not supplied, so do not claim principal reconciliation passes."
    },
    provisionalDeduction: {
      id: "PROVISIONAL-815-001",
      selectedPeriod: "2024-06",
      expectedTotalInr: 815,
      components: null,
      expectedInvariant: "canonical component values must sum to exactly 815 and displayed total must equal canonical total",
      status: "TOTAL_ORACLE_ONLY",
      note: "The expected total is known, but component breakdown/source rules are not supplied. Never fabricate component values."
    },
    breakEven: {
      id: "BREAK-EVEN-4672-001",
      expectedBreakEvenInr: 4672,
      inputs: null,
      expectedInvariant: "every formula input has value, unit, source and status; canonical result and displayed value both equal 4672",
      status: "OUTPUT_ORACLE_ONLY",
      note: "Reference output is known, but exact source inputs/formula configuration are not available in this fixture context."
    },
    fuelPrecision: {
      id: "FUEL-PRECISION-001",
      date: "2024-06-15",
      amountInr: 500,
      pricePerKgInr: 82,
      expectedQuantityKgExact: 500 / 82,
      expectedQuantityKgDisplay2dp: 6.1,
      expectedInvariant: "preserve exact/raw quantity for canonical calculation; apply documented rounding only to display"
    },
    preBusinessMaintenance: {
      id: "PRE-BUSINESS-MAINT-001",
      distanceKm: 60000,
      rateInrPerKm: 0.6,
      expectedObligationInr: 36000,
      ongoingMaintenanceProvisionRateInrPerKm: 1.6,
      expectedInvariant: "historical pre-business obligation is a separate bucket and is not double-counted as ongoing provision or actual maintenance"
    },
    missingTripKm: tripScenarios[0]
  };

  return {
    schemaVersion: 1,
    fixtureName: "KFE three-year synthetic calculation fixture",
    synthetic: true,
    isolation: {
      pwaStorageRead: false,
      pwaStorageWrite: false,
      indexedDbAccess: false,
      localStorageAccess: false,
      serviceWorkerImport: false,
      outputDirectoryIsSeparateFromAppStorage: true
    },
    period: { start: iso(START), end: iso(END), calendarDays: daily.length, months: monthly.length },
    assumptions: [
      "200 km on every calendar day (exactly 200 km/day, not a claim about actual operating patterns)",
      "Fuel cost baseline ₹3.20/km",
      "Ongoing maintenance provision baseline ₹1.60/km; this is not actual maintenance paid",
      "EMI baseline ₹11,324/month, modeled on the first day of each month",
      "Compliance baseline ₹30,000 per annual Jan 1–Dec 31 validity record; accrue across 365 or 366 IST calendar days without daily rounding",
      "Synthetic business start date 2023-01-01, solely to exercise three-year period logic",
      "Pre-business maintenance obligation 60,000 km × ₹0.60/km = ₹36,000, separate from ongoing provision",
      "Unknown loan principal/rate/tenure and unknown provisional/break-even component inputs are intentionally not fabricated"
    ],
    expectedAggregates: {
      calendarDays: daily.length,
      totalDistanceKm: daily.length * 200,
      fuelCostInr: INR(daily.length * 200 * 3.2),
      ongoingMaintenanceProvisionInr: INR(daily.length * 200 * 1.6),
      complianceProvisionInr: 90000,
      emiPaymentCount: monthly.length,
      emiTotalInr: INR(monthly.length * 11324),
      preBusinessMaintenanceObligationInr: 36000
    },
    specialCases,
    daily,
    monthly
  };
}

const outDir = path.resolve(process.argv[2] || path.join(process.cwd(), "tmp", "synthetic-kfe-fixture"));
fs.mkdirSync(outDir, { recursive: true });
const fixture = generate();
fs.writeFileSync(path.join(outDir, "fixture.json"), JSON.stringify(fixture, null, 2) + "\n");
fs.writeFileSync(path.join(outDir, "README.txt"), [
  "SYNTHETIC KFE FIXTURE — NOT REAL BUSINESS DATA",
  "",
  "Generated by generate-fixture.cjs. Safe boundary: fixture files only.",
  "No PWA storage is accessed or modified. Do not import this fixture into production IndexedDB.",
  "",
  "Files:",
  "- fixture.json: 1,096 daily records, 36 monthly rollups and named edge-case oracles.",
  "",
  "Run:",
  "  node tests/fixtures/synthetic-three-year/generate-fixture.cjs",
  "  node tests/fixtures/synthetic-three-year/generate-fixture.cjs /tmp/kfe-synthetic",
  "",
  "Important:",
  "- PARTIAL_ORACLE_ONLY / TOTAL_ORACLE_ONLY means the output target is known but missing source inputs prevent a full reconciliation claim.",
  "- Test evidence must record fixture ID, selected period, canonical output, displayed output and pass/fail.",
  "- The generated fixture is separate from app storage; it is not a production seed or migration."
].join("\n") + "\n");
console.log(JSON.stringify({
  outputDirectory: outDir,
  dailyRecords: fixture.daily.length,
  monthlyRecords: fixture.monthly.length,
  expectedAggregates: fixture.expectedAggregates,
  files: ["fixture.json", "README.txt"]
}, null, 2));
