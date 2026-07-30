export default function PageSkeleton({ title, description, actions, sections = [] }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-1">
        <h1 className="text-xl sm:text-2xl font-bold">{title}</h1>
        {actions && <div className="flex-shrink-0 flex gap-2">{actions}</div>}
      </div>
      <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>
        {description}
      </p>

      <div className="flex flex-col gap-5">
        {sections.map((section, i) => (
          <div
            key={i}
            className="rounded-xl p-5 sm:p-6"
            style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}
          >
            <p className="text-sm font-semibold mb-3">{section.label}</p>
            {section.content ? (
              section.content
            ) : (
              <div className="flex flex-col gap-2">
                {Array.from({ length: section.rows ?? 3 }).map((_, j) => (
                  <div
                    key={j}
                    className="h-9 rounded-lg animate-pulse"
                    style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
