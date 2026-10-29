/** Cases whose 3D geometry is fully modeled; gates the cooling airflow sim and Build's support badge. */
export const FULLY_SUPPORTED_CASES: readonly string[] = ['HYTE Y70', 'HYTE Y50', 'HYTE X50'];

export const isFullySupportedCase = (caseModel: string | undefined | null): boolean => !!caseModel && FULLY_SUPPORTED_CASES.includes(caseModel);
