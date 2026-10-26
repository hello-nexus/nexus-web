/**
 * Cases the 3D airflow view supports, by the `caseModel` name Build resolves for the setup's case (one entry covers every SKU and color of that chassis).
 * Adding a case means adding one entry here.
 */
export const AIRFLOW_CASES: readonly string[] = ['HYTE Y70', 'HYTE Y50'];

export const supportsAirflow = (caseModel: string | undefined | null): boolean => !!caseModel && AIRFLOW_CASES.includes(caseModel);
