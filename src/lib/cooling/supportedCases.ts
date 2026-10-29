/**
 * Cases whose 3D geometry is fully modeled, by the `caseModel` name Build resolves for the setup's case (one entry covers every SKU and color of that chassis).
 * One flag: these get the airflow simulation and no "coming soon" badge in Build's 3D view. Adding a case means adding one entry here.
 */
export const FULLY_SUPPORTED_CASES: readonly string[] = ['HYTE Y70', 'HYTE Y50', 'HYTE X50'];

export const isFullySupportedCase = (caseModel: string | undefined | null): boolean => !!caseModel && FULLY_SUPPORTED_CASES.includes(caseModel);
