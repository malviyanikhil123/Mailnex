import { Inbox, Trash2, Tag, Settings2 } from "lucide-react";
import { Link } from "react-router-dom";
import type { InboxStats } from "../../types/api";

export type Selection = number | "uncategorized" | "all" | "trash";

/**
 * Category rail. A vertical list on desktop, a horizontally scrollable chip row on
 * mobile — the bottom of the mobile viewport is already taken by the app's nav
 * capsule, so a second fixed element there would fight it.
 */
export function CategorySidebar({
  stats,
  selected,
  onSelect,
}: {
  stats: InboxStats | undefined;
  selected: Selection;
  onSelect: (s: Selection) => void;
}) {
  const items: Array<{ key: Selection; label: string; count: number; unread: number; color?: string }> = [
    { key: "all", label: "All mail", count: stats?.total ?? 0, unread: stats?.unread ?? 0 },
    ...(stats?.byCategory ?? []).map((c) => ({
      key: c.categoryId as Selection,
      label: c.name,
      count: c.count,
      unread: c.unread,
      color: c.color,
    })),
    { key: "uncategorized", label: "Uncategorized", count: stats?.uncategorized ?? 0, unread: 0 },
    { key: "trash", label: "Trash (Mailnex)", count: stats?.trashed ?? 0, unread: 0 },
  ];

  return (
    <>
      {/* Desktop rail */}
      <nav className="hidden md:block w-56 shrink-0 space-y-1" aria-label="Mail categories">
        {items.map((item) => (
          <RailButton
            key={String(item.key)}
            // itemKey, not key: React consumes `key` and it would never reach the component.
            itemKey={item.key}
            label={item.label}
            count={item.count}
            unread={item.unread}
            color={item.color}
            active={selected === item.key}
            onClick={() => onSelect(item.key)}
          />
        ))}
        <Link
          to="/inbox/categories"
          className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 transition hover:bg-[#BAE6FD]/40 dark:text-gray-400 dark:hover:bg-[#164549]/60"
        >
          <Settings2 size={15} />
          Manage categories
        </Link>
      </nav>

      {/* Mobile chip row */}
      <div className="md:hidden -mx-4 px-4">
        <div className="flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="Mail categories">
          {items.map((item) => {
            const active = selected === item.key;
            return (
              <button
                key={String(item.key)}
                role="tab"
                aria-selected={active}
                onClick={() => onSelect(item.key)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  active
                    ? "border-[#60A5FA] bg-[#60A5FA] text-white dark:border-[#71C9CE] dark:bg-[#71C9CE] dark:text-gray-950"
                    : "border-[#BAE6FD] bg-[#F1F5F9] text-gray-700 dark:border-[#164549] dark:bg-[#0e2124] dark:text-gray-300"
                }`}
              >
                {item.color && !active && (
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                )}
                {item.label}
                <span className={active ? "opacity-80" : "text-gray-500 dark:text-gray-500"}>{item.count}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

function RailButton({
  label,
  count,
  unread,
  color,
  active,
  onClick,
  itemKey,
}: {
  label: string;
  count: number;
  unread: number;
  color?: string;
  active: boolean;
  onClick: () => void;
  itemKey?: Selection;
}) {
  const Icon = itemKey === "trash" ? Trash2 : itemKey === "all" ? Inbox : Tag;
  return (
    <button
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
        active
          ? "bg-[#BAE6FD] font-semibold text-gray-900 dark:bg-[#164549] dark:text-[#E3FDFD]"
          : "text-gray-700 hover:bg-[#BAE6FD]/40 dark:text-gray-300 dark:hover:bg-[#164549]/60"
      }`}
    >
      {color ? (
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      ) : (
        <Icon size={15} className="shrink-0 text-gray-500 dark:text-gray-400" />
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {unread > 0 && (
        <span className="shrink-0 rounded-full bg-[#60A5FA] px-1.5 text-[10px] font-bold text-white dark:bg-[#71C9CE] dark:text-gray-950">
          {unread}
        </span>
      )}
      <span className="shrink-0 text-xs text-gray-500 dark:text-gray-500">{count}</span>
    </button>
  );
}
