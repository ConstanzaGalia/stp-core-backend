export const EXERCISE_PUBLISHER_COMPANY_IDS = [
  '7623d786-23a5-447b-b970-bb58ee2a70ac',
  '604b1d74-d37a-45e6-af50-a755fb440b01',
  '90d1a538-dc35-47ce-afb7-2035dbaa51bb',
] as const;

export type ExercisePublisherCompanyId =
  (typeof EXERCISE_PUBLISHER_COMPANY_IDS)[number];

export const STP_MAIN_COMPANY_ID = EXERCISE_PUBLISHER_COMPANY_IDS[0];

export function isExercisePublisherCompany(companyId: string): boolean {
  return (EXERCISE_PUBLISHER_COMPANY_IDS as readonly string[]).includes(
    companyId,
  );
}
