import { confirm } from '@swathbook/mobile/confirm';
import { Alert, Platform } from 'react-native';

import { useSetJobStatus } from '@/data/api';
import type { Step } from '@/lib/job-rules';

/** Shows an error the person can act on (Alert does nothing on web). */
export function showError(title: string, message: string) {
  if (Platform.OS === 'web') globalThis.alert?.(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

/**
 * Runs one of a job's steps: asks first when the step says to, then moves the
 * job to its new status (update_job_status, as the signed-in member).
 */
export function useRunStep(businessId: string) {
  const mutation = useSetJobStatus(businessId);

  async function run(jobId: string, step: Step, reason?: string) {
    if (step.confirm) {
      const ok = await confirm({ title: `${step.label}?`, message: step.confirm, confirmLabel: step.label, destructive: step.danger });
      if (!ok) return;
    }
    mutation.mutate(
      { id: jobId, status: step.status, reason: reason ?? step.reason },
      { onError: (error) => showError("Couldn't update the job", error.message) },
    );
  }

  return { run, pending: mutation.isPending };
}
