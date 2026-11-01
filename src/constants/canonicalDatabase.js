/** Shared schema-version contract used by storage and backup validation. */
export const CANONICAL_DB_VERSION = 18

/** Object stores retired from the active KFE data model. */
export const RETIRED_CANONICAL_STORES = Object.freeze([
  'odoGaps', 'days', 'movement_artifacts', 'loan_payments', 'prepayments',
  'driver_targets', 'break_even_inputs', 'settlements', 'financial_period_snapshots',
  'driver_collected_data', 'admin_records', 'financial_inputs',
])
