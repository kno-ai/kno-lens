import { CATEGORY_FILTERS, SMART_FILTERS } from "../filter.js";

interface ToolbarProps {
  activeFilter: string | null;
  onFilterChange: (filter: string | null) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  /** Label shown beside the search input when a smart filter is active. */
  searchHint?: string | undefined;
}

export function Toolbar({
  activeFilter,
  onFilterChange,
  searchQuery,
  onSearchChange,
  searchHint,
}: ToolbarProps) {
  return (
    <div class="toolbar">
      <div class="toolbar__left">
        <select
          class="toolbar__select"
          value={activeFilter ?? ""}
          onChange={(e) => {
            const val = e.currentTarget.value;
            onFilterChange(val === "" ? null : val);
          }}
        >
          <option value="">{"\u25bd"} Filter</option>
          <optgroup label="By type">
            {CATEGORY_FILTERS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Smart filters">
            {SMART_FILTERS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </optgroup>
        </select>
      </div>
      <div class="toolbar__right">
        {searchHint && <span class="toolbar__search-hint">{searchHint}:</span>}
        <input
          class="toolbar__search"
          type="text"
          placeholder="Search…"
          value={searchQuery}
          onInput={(e) => onSearchChange(e.currentTarget.value)}
        />
      </div>
    </div>
  );
}
