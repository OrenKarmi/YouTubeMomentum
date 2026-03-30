export default function MediaThumb({ src, alt = '', className = '', label = '♪' }) {
  if (src) {
    return <img className={className} src={src} alt={alt} />;
  }

  return (
    <div className={`${className} media-placeholder`.trim()} aria-hidden="true">
      <span>{label}</span>
    </div>
  );
}