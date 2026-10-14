# Android APK signing and update continuity

This document is the release contract for every KFE Android APK. Follow it for routine releases and recovery.

## Immutable Android identity

- **Application ID / package name:** `com.kanishka.pwa`
- **Current baseline version:** `2.1.1` (`versionCode 5`). Increase `versionCode` for every subsequent Android release; never reuse a published version code.
- **Current CI signing certificate SHA-256:** `3099f60a97640f72931b7c33bc8330a845bdc1e4979b9ea3de0429db54a3eb2f`
- **Current CI APK SHA-256 baseline:** `0c285c28a832d18ab8adbb17b91696807c02f0365c8196af9090ad5e47dd8bb6` (this identifies that one artifact only; each new APK has its own checksum).

The certificate fingerprint is a public identity check, not the private signing key. If a signing-key rotation is ever required, treat it as a planned migration and explicitly assess Android update compatibility before publishing. Do not silently replace the key.

## Signing key custody and CI configuration

The persistent signing key used by the successful CI release gate is required for future APKs. Keep the keystore and its passwords/alias in the repository's approved GitHub Actions secret or protected-file configuration. The Gradle signing configuration currently reads these environment variables:

- `KFE_ANDROID_KEYSTORE_PATH`
- `KFE_ANDROID_KEYSTORE_PASSWORD`
- `KFE_ANDROID_KEY_ALIAS`
- `KFE_ANDROID_KEY_PASSWORD`

The path variable points to the keystore file made available to the build job; the other variables provide its credentials. Preserve the existing secret-to-environment mapping in the workflow. Do not print secret values in logs, put a keystore or passwords in Git, artifacts, issue comments, or this document, or generate a new key for a routine build.

Maintain an access-controlled backup of the keystore and recovery instructions outside the repository. Limit access to the people and systems responsible for releases. Verify that the backup can be recovered without exposing the key.

## Required checks before publishing each APK

1. Build using the persistent CI signing configuration. A missing signing secret or keystore must fail the release gate; do not silently publish an APK signed with a fallback/debug key.
2. Verify the APK package ID is exactly `com.kanishka.pwa`.
3. Verify the signing certificate SHA-256 matches the approved fingerprint above.
4. Verify `versionCode` is greater than the last published version code.
5. Verify APK integrity and record the exact artifact SHA-256, package ID, version name/code, and signing certificate fingerprint in the CI run output or release identity artifact.
6. Run the Android Exact APK Smoke Gate and the relevant test suite against the exact APK that will be offered for installation.
7. Test an in-place upgrade from the previous approved APK where practical. The update must retain the same package ID and signing identity. Do not treat a successful build alone as proof that Android will accept an update.

If the certificate changes unexpectedly, stop publication. Investigate the CI secrets, keystore provisioning, and artifact provenance; do not ask users to uninstall as a routine workaround.

## One-time migration note

The older installed KFE build was reported with certificate SHA-256:

`76d9af0aebf956db07bd343cfa2b2f2498b90667f6c9107ee548a0c285765c61`

That certificate differs from the current CI certificate. Android does not accept an ordinary in-place update when the signing certificates differ. The one-time uninstall/reinstall is specific to migrating from that old signing identity; it must not become the normal release process. After migration, future APKs must continue using the current persistent CI signing key and package ID so compatible releases can install as updates.

## Release operator checklist

- [ ] Persistent keystore and CI secrets are present; no secret values are exposed.
- [ ] Package ID is `com.kanishka.pwa`.
- [ ] Signing certificate matches the approved SHA-256 fingerprint.
- [ ] Version code is incremented.
- [ ] Exact candidate APK passes integrity, smoke, and release tests.
- [ ] Artifact checksum and release identity are recorded.
- [ ] Upgrade compatibility is verified or any limitation is explicitly documented before release.
