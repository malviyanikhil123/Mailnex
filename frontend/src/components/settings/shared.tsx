export function SectionHeader({ title, badge }: { title: string; badge?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="font-semibold">{title}</h2>
      {badge && <span className="text-xs text-gray-500">{badge}</span>}
    </div>
  );
}
