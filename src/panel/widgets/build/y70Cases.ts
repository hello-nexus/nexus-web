// Same ids as the service's Y70CaseAssigner, the cases a Y70 display fills in.
const Y70_CASE_IDS = new Set([
  'aa7c32bd-7c30-4353-965a-368beae8e65a',
  '09e6046c-0ac7-4af7-aab3-2c8ab6c838ac',
  '2120f1dd-b8ef-4b56-aaa6-ee2c6f9de45b',
  '2dcc1d35-1ef8-4bb5-b1fd-7fe57c87b882',
  'e62dbe85-f665-4aa4-a6a0-19da7d0256da',
  '075432e5-2925-4078-a139-ee6335cc6360',
  'eea4aa90-5848-40f3-97c0-d4176a586064',
  'd0fba4f1-b215-4b00-afd2-8983fb374840',
  '206fa5e5-d5e1-441a-bd6d-6644e498c002',
  '47780428-8591-49ce-8101-517b64e2bb5f',
  '066fedbd-71b4-4787-a6b4-4ddb7aabd6d8',
  '0a4e3be9-0866-411f-a1be-dcb4055b767e',
  '3a8ff174-de02-4c85-bf68-3536826fec76',
  '517f12f3-4679-4d13-8832-0fcd2c2a40ea',
  'ef06ada1-e96d-42ee-8726-05942881d65b',
]);

export const isY70CaseId = (caseId: string | null): boolean => caseId !== null && Y70_CASE_IDS.has(caseId);
