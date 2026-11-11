import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import messages from '../../messages/tr.json';

export const alt = messages.metadata.title;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  const logo = readFileSync(join(process.cwd(), 'public/brand/mezunportal-koyu.svg'));
  const src = `data:image/svg+xml;base64,${logo.toString('base64')}`;
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        position: 'relative',
        overflow: 'hidden',
        background: '#0E1A38',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          width: 480,
          height: 480,
          borderRadius: 480,
          border: '2px solid #4551a0',
          opacity: 0.35,
          left: -205,
          top: -160,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          width: 360,
          height: 360,
          borderRadius: 360,
          border: '2px solid #bc5d79',
          opacity: 0.3,
          right: -130,
          bottom: -140,
        }}
      />
      <img src={src} width={760} height={144} alt="" />
      <div
        style={{
          display: 'flex',
          marginTop: 40,
          fontSize: 38,
          color: '#f4f2ff',
          letterSpacing: -0.5,
        }}
      >
        {messages.landing.shareImageText}
      </div>
      <div
        style={{
          display: 'flex',
          width: 110,
          height: 6,
          marginTop: 48,
          borderRadius: 6,
          background: '#ff8798',
        }}
      />
    </div>,
    size,
  );
}
