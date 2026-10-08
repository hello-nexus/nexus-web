import { Search } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Button } from '../Button/Button';
import { HoverTooltip } from '../HoverTooltip/HoverTooltip';
import { SearchInput } from '../SearchInput/SearchInput';

/**
 * The looking-glass filter for a page's device rail (lighting devices, cooling
 * fans): a header toggle that opens a filter field above the list. Closing it
 * clears the query, so a hidden field never keeps the rail filtered.
 */
export function useRailSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const close = useCallback(() => { setOpen(false); setQuery(''); }, []);
  const toggle = useCallback(() => {
    if (open) close();
    else setOpen(true);
  }, [open, close]);
  return { open, query, setQuery, toggle, close, active: query.trim().length > 0 };
}

export function RailSearchButton({ open, onToggle, label }: {
  open: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <HoverTooltip body={label} side="bottom">
      <Button
        tone="ghost"
        size="sm"
        icon={<Search />}
        aria-label={label}
        aria-pressed={open}
        onClick={onToggle}
      />
    </HoverTooltip>
  );
}

export function RailSearchField({ query, onChange, onClose, placeholder, className }: {
  query: string;
  onChange: (next: string) => void;
  onClose: () => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <SearchInput
        value={query}
        onChange={onChange}
        placeholder={placeholder}
        autoFocus
        onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
      />
    </div>
  );
}
