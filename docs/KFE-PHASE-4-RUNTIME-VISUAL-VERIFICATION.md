# KFE Runtime Verification — Current Product Scope

## Surfaces

Automated runtime checks cover the four active PWA surfaces: Work, Timeline, Performance, and Admin.

## Required checks

- **Work:** shift start/end remain PWA-owned; ride actions preserve one canonical Trip identity; cancellation fee may be blank and defaults to ₹0; fuel forms remain usable offline.
- **Timeline:** saved ride and fuel records are read-only. The four event GPS snapshots are displayed from saved data. Area-name lookup runs only on a user pull-to-refresh while online.
- **Performance:** reads saved revenue and fuel facts only and does not mutate business records.
- **Admin:** only Business Setup, Vehicle, Driver, Compliance, Maintenance, and Loan details are active source-record forms. Drafts clear only after confirmed saves or explicit confirmed discard.
- **Android overlay:** Capacitor/native Android owns overlay and native GPS behavior. Capture one-shot snapshots for going to pickup, cancellation, trip start, and trip end; preserve event timestamps separately from provider capture timestamps.
- **Offline behavior:** ride workflow and GPS snapshot persistence must not depend on internet. No continuous tracking, route tracing, or ride-distance calculations.
- **Theme/layout:** dark-only visual system; no Light/Auto theme choices, horizontal overflow, or overlapping mobile form actions.
- **Recovery:** existing records remain in canonical storage and local/phone backup paths. Retiring a feature must not delete historical records.

## Evidence discipline

CI source contracts and browser runtime checks are not physical-device acceptance. Report completed CI, APK generation, and phone verification separately; do not infer one from another.
