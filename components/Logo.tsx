// The Owed mark: an envelope with a second one tucked behind it, the assistant you CC.
// One SVG string feeds the header, the sign-in page and the generated PNG icons.
export const MARK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
  '<rect width="64" height="64" rx="15" fill="#1a2230"/>' +
  '<rect x="19" y="15" width="32" height="22" rx="3" fill="#b4233c"/>' +
  '<rect x="11" y="24" width="38" height="26" rx="3.5" fill="#fff"/>' +
  '<path d="M12.5 26 L30 39 L47.5 26" fill="none" stroke="#1a2230" stroke-width="3.5" stroke-linejoin="round"/>' +
  "</svg>";

export const MARK_DATA_URI = `data:image/svg+xml,${encodeURIComponent(MARK_SVG)}`;

export function Mark({ size = 36 }: { size?: number }) {
  // Decorative: the wordmark or the page title names the product.
  return <img src={MARK_DATA_URI} width={size} height={size} alt="" />;
}

export function Logo() {
  return (
    <span className="logo">
      <Mark size={40} />
      <span className="wordmark">Owed</span>
    </span>
  );
}
