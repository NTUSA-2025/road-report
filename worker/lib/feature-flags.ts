export type SubmissionFeatureEnv = {
  REPAIR_SUBMIT_ENABLED?: string;
};

// DB-only mode is open for submissions; switch to true to forward new reports to NTU.
export const FORWARD_TO_NTU = false;

export function isRepairSubmitEnabled(env: SubmissionFeatureEnv) {
  return ["1", "true", "yes", "on"].includes(
    `${env.REPAIR_SUBMIT_ENABLED ?? ""}`.trim().toLowerCase(),
  );
}
