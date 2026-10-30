import { spawnSync } from 'node:child_process'

const suites = [
  'performancePhaseOneOverview.contract.js',

  
  
  'phaseBLifecycleRecovery.contract.js',
  'workDraftController.contract.js',
  'nativeWorkActionController.contract.js',
  'phase2BusinessReliabilityRegression.contract.js',
  'gpsValhallaRemoval.contract.js',
  'gpsStatusIndicator.contract.js',
  'eventLocationCapture.contract.js',
  'phase6ApplicationFlows.contract.js',
  'timelineLocationLabels.contract.js',
  'locationNameService.contract.js',
  'sharedConnectivityService.contract.js',
  'tripBoundaryTimestamp.contract.js',
  'canonicalWorkReadAuthority.contract.js','browserCanonicalWriteContract.contract.js','canonicalWorkRecordFactory.contract.js','lifecycleStorageGuard.contract.js','nativeFirstWorkMutations.contract.js',
  'overlayLifecycleOwnershipAndRuntimeError.contract.js',
  'tripCompletionCanonicalReadRace.contract.js',
  
  'canonicalWorkRecovery.contract.js',
  'liveRevenueSwipeParity.contract.js',
  'nativeOverlayFareCancellation.contract.js',
  'nativeCanonicalPersistence.contract.js',
  'nativeCanonicalMigration.contract.js',
  'startupPermissionGate.contract.js',   'blankWorkspacePersistentSettings.contract.js', 'blankTimelinePerformance.contract.js', 'timelineReadModel.contract.js', 'formSavePathRegression.contract.js',   'universalFormDraftRecoveryRegression.contract.js',  'pwaFormSavePathMatrix.contract.js',  'pwaFormSavePathRegression.contract.js','endToEndConformance.contract.js',  'authorityMap.contract.js','architecture.contract.js','phase3ArchitectureGuardrails.contract.js','phase4RuntimeVisualVerification.contract.js','phase4AutomatedOperationalAudit.contract.js','offlineSync.contract.js','shiftStartGoldenVectors.contract.js','work.contract.js','admin.contract.js','adminNavigation.contract.js','adminFieldMatrix.contract.js','adminPhase3Integrity.contract.js','adminPhase4Usability.contract.js','shell.contract.js','ui.contract.js','backup.contract.js','resetProtocol.contract.js','backupConfig.contract.js',  'formIntegrityE2E.contract.js','formDraftRecovery.contract.js','adminDraftRecovery.contract.js','phase1FormsTechnical.contract.js','phase2FormsRuntimeUx.contract.js','phase2BusinessRuleDefects.contract.js','auditMutation.contract.js','integrity.contract.js','canonicalData.contract.js','persistence.contract.js','phase4PersistenceDataIsolation.contract.js','rideCapture.contract.js','operationalRecords.contract.js','phase7CanonicalSyntheticIsolation.contract.js','phase7DataRecovery.contract.js','phase11VisualDnaAccessibility.contract.js','phase11ControlledPilot.contract.js','phase8AndroidCapacitorNative.contract.js','phase8SecurityPermissions.contract.js','phase9ProductionConfiguration.contract.js','phase7CapacitorAndroid.contract.js','phase8BackupRestore.contract.js','phase12FinalReleaseReadiness.contract.js','phase9PerformanceBatteryConcurrency.contract.js','phase9CloudBackupSync.contract.js','presentationImpact.contract.js','uiUxShellDecoupling.contract.js','uiIsolationGate.contract.js','nativeSwipeVisualParity.contract.js','themeCompliance.contract.js','nativeWorkActions.contract.js','nativeTripFormRecovery.contract.js','nativeSwipeGestureRecovery.contract.js', 'timeline.contract.js','syntheticData.contract.js','stabilizationRuntimePwa.contract.js','phase2BuildCiDeployment.contract.js','phase3StartupPwaLifecycle.contract.js','canonicalTripLifecycle.contract.js','prelaunchInPlaceUpgrade.contract.js','prelaunchProductionReadiness.contract.js'
]
const results=[]
for(const suite of suites){const startedAt=Date.now();const result=spawnSync(process.execPath,[`src/tests/${suite}`],{encoding:'utf8',stdio:['ignore','pipe','pipe']});const output=[result.stdout,result.stderr].filter(Boolean).join('');const passed=result.status===0;results.push({suite,passed,status:result.status,signal:result.signal,output,durationMs:Date.now()-startedAt});process.stdout.write(`\n=== ${passed?'PASS':'FAIL'}: ${suite} ===\n`);if(output)process.stdout.write(output.endsWith('\n')?output:`${output}\n`)}
const failures=results.filter(r=>!r.passed);process.stdout.write(`\n=== CONTRACT FAILURE INVENTORY ===\nSuites: ${results.length}\nPassed: ${results.length-failures.length}\nFailed: ${failures.length}\n`);for(const f of failures)process.stdout.write(`- ${f.suite} (exit=${f.status??'null'}, signal=${f.signal??'none'})\n`);if(failures.length)process.exitCode=1;else process.stdout.write('\nALL CONTRACT SUITES PASSED\n')