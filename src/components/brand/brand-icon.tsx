/** Uygulama ikonu (favicon, ana ekrana ekle, manifest): marka renginde zemin, beyaz “M”. */
export function BrandIcon({ size }: { size: number }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#1d4ed8',
        color: '#ffffff',
        fontSize: Math.round(size * 0.62),
        fontWeight: 700,
        fontFamily: 'sans-serif',
      }}
    >
      M
    </div>
  );
}
