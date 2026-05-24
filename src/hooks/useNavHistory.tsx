import { createContext, useContext, type ReactNode } from 'react';

interface NavHistory {
  canGoBack: boolean;
  canGoForward: boolean;
  goBack: () => void;
  goForward: () => void;
}

// Absence = ViewHeader is rendered on a surface that does not own a history
// stack (e.g. the touch panel kiosk). The chevrons render nothing in that
// case; the desktop Dashboard wraps its content tree in NavHistoryProvider
// and feeds values straight from useRoute.
const NavHistoryContext = createContext<NavHistory | null>(null);

export function NavHistoryProvider({ value, children }: { value: NavHistory; children: ReactNode }) {
  return <NavHistoryContext.Provider value={value}>{children}</NavHistoryContext.Provider>;
}

export function useNavHistory(): NavHistory | null {
  return useContext(NavHistoryContext);
}
