import { CATEGORY_FILTERS } from "../filter.js";

interface ToolbarProps {
  activeFilter: string | null;
  onFilterChange: (filter: string | null) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function Toolbar({
  activeFilter,
  onFilterChange,
  searchQuery,
  onSearchChange,
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
          {CATEGORY_FILTERS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      <div class="toolbar__right">
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
