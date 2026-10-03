// The listing id of the app whose tree a host component renders in, so a link
// press can be attributed to the app that offered it.
import { createContext } from 'react';

export const SdkAppIdContext = createContext<string | undefined>(undefined);
