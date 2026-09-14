export type SubmissionFeatureEnv = {
  REPAIR_SUBMIT_ENABLED?: string;
};

export function isRepairSubmitEnabled(env: SubmissionFeatureEnv) {
  return ["1", "true", "yes", "on"].includes(
    `${env.REPAIR_SUBMIT_ENABLED ?? ""}`.trim().toLowerCase(),
  );
}
