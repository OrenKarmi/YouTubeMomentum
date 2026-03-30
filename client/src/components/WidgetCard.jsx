export default function WidgetCard({ title, subtitle, loading, children, className = '' }) {
  return (
    <section className={`widget-card ${className}`.trim()}>
      <div className="widget-card__header">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p className="widget-card__subtitle">{subtitle}</p> : null}
        </div>
      </div>
      {loading ? <div className="widget-loading">Loading...</div> : children}
    </section>
  );
}
