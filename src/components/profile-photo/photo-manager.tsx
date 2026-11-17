'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Avatar, Button, Checkbox, PageHeader } from '@/components/ui';
import { CURRENT_CONSENT_VERSIONS } from '@/contracts/privacy';
import {
  PROFILE_PHOTO_MAX_BYTES,
  profilePhotoHref,
  type PhotoCrop,
} from '@/contracts/profile-photo';
import { ERROR_CODES, type ErrorCode } from '@/lib/errors';
import { recordConsents } from '@/server/actions/privacy';
import { useHydrated } from '@/hooks/use-hydrated';

export function PhotoManager({
  userId,
  hasPhoto,
  consentGranted,
  cleanupPending: initialCleanupPending,
}: {
  userId: string;
  hasPhoto: boolean;
  consentGranted: boolean;
  cleanupPending: boolean;
}) {
  const t = useTranslations('profilePhoto');
  const hydrated = useHydrated();
  const errors = useTranslations('errors.codes');
  const router = useRouter();
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<string>();
  const [dimensions, setDimensions] = useState({ width: 256, height: 256 });
  const [crop, setCrop] = useState<PhotoCrop>({ x: 0.5, y: 0.5, zoom: 1 });
  const [consent, setConsent] = useState(false);
  const [present, setPresent] = useState(hasPhoto);
  const [granted, setGranted] = useState(consentGranted);
  const [cleanupPending, setCleanupPending] = useState(initialCleanupPending);
  const [revision, setRevision] = useState(0);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const fileControl = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<ErrorCode>();
  const [notice, setNotice] = useState('');
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const side = Math.min(dimensions.width, dimensions.height) / crop.zoom;
  async function save() {
    if (!file || busy.current) return;
    if (!consent) {
      setError('CONSENT_REQUIRED');
      return;
    }
    busy.current = true;
    setPending(true);
    setError(undefined);
    setNotice('');
    try {
      const body = new FormData();
      body.set('file', file);
      body.set('consent', 'true');
      body.set('consentVersion', CURRENT_CONSENT_VERSIONS.PROFILE_PHOTO_VISIBILITY);
      for (const key of ['x', 'y', 'zoom'] as const) body.set(key, String(crop[key]));
      const response = await fetch('/api/profil-fotografi', { method: 'POST', body });
      const result = (await response.json()) as { saved?: boolean; errorCode?: ErrorCode };
      if (!response.ok || !result.saved) {
        setError(
          result.errorCode && ERROR_CODES.includes(result.errorCode)
            ? result.errorCode
            : 'SERVER_UNEXPECTED',
        );
        return;
      }
      if (fileControl.current) fileControl.current.value = '';
      setPresent(true);
      setGranted(true);
      setCleanupPending(false);
      setFile(undefined);
      setPreview(undefined);
      setConsent(false);
      setRevision((value) => value + 1);
      setNotice(t('saved'));
      router.refresh();
    } catch {
      setError('SERVER_UNEXPECTED');
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  async function remove() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(undefined);
    setNotice('');
    try {
      const result = await recordConsents({
        decisions: [
          {
            documentType: 'PROFILE_PHOTO_VISIBILITY',
            version: CURRENT_CONSENT_VERSIONS.PROFILE_PHOTO_VISIBILITY,
            granted: false,
          },
        ],
      });
      if (!result.ok) {
        if (result.errorCode === 'PHOTO_CLEANUP_PENDING') {
          setPresent(false);
          setGranted(false);
          setCleanupPending(true);
          router.refresh();
        }
        setError(result.errorCode);
        return;
      }
      if (fileControl.current) fileControl.current.value = '';
      setPresent(false);
      setGranted(false);
      setCleanupPending(false);
      setFile(undefined);
      setPreview(undefined);
      setConsent(false);
      setNotice(t('removed'));
      router.refresh();
    } catch {
      setError('SERVER_UNEXPECTED');
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <div className="w-full max-w-xl space-y-6">
      <PageHeader title={t('title')} description={t('description')} />
      {present && (
        <Avatar
          key={revision}
          name={t('title')}
          src={`${profilePhotoHref(userId, 512)}&v=${revision}`}
          size="lg"
        />
      )}
      <form
        data-hydrated={hydrated ? 'true' : undefined}
        inert={!hydrated}
        aria-busy={!hydrated || pending}
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="space-y-2">
          <input
            aria-label={t('choose')}
            hidden
            tabIndex={-1}
            type="file"
            ref={fileControl}
            accept="image/jpeg,image/png,image/webp"
            disabled={pending}
            onChange={(event) => {
              const selected = event.target.files?.[0];
              setError(undefined);
              setNotice('');
              setFile(undefined);
              setPreview(undefined);
              setConsent(false);
              if (!selected) return;
              if (selected.size > PROFILE_PHOTO_MAX_BYTES || selected.size === 0) {
                setError(selected.size === 0 ? 'PHOTO_INVALID' : 'PHOTO_TOO_LARGE');
                event.target.value = '';
                return;
              }
              setFile(selected);
              setPreview(URL.createObjectURL(selected));
              setCrop({ x: 0.5, y: 0.5, zoom: 1 });
            }}
          />
          <Button
            variant="secondary"
            onClick={() => fileControl.current?.click()}
            loading={pending}
          >
            {t(file ? 'chooseAgain' : 'choose')}
          </Button>
        </div>
        {preview && (
          <>
            <div
              className="relative mx-auto size-64 max-w-full overflow-hidden rounded-card border border-border bg-bg"
              role="img"
              aria-label={t('preview')}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt=""
                onLoad={(event) =>
                  setDimensions({
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  })
                }
                onError={() => {
                  setFile(undefined);
                  setPreview(undefined);
                  setError('PHOTO_INVALID');
                }}
                className="absolute max-w-none"
                style={{
                  width: (dimensions.width * 256) / side,
                  height: (dimensions.height * 256) / side,
                  left: (-(dimensions.width - side) * crop.x * 256) / side,
                  top: (-(dimensions.height - side) * crop.y * 256) / side,
                }}
              />
            </div>
            {(['x', 'y', 'zoom'] as const).map((key) => (
              <label key={key} className="block font-medium">
                {t(key === 'x' ? 'horizontal' : key === 'y' ? 'vertical' : 'zoom')}
                <input
                  type="range"
                  min={key === 'zoom' ? 1 : 0}
                  max={key === 'zoom' ? 3 : 1}
                  step="0.01"
                  value={crop[key]}
                  disabled={pending}
                  onChange={(event) => setCrop({ ...crop, [key]: Number(event.target.value) })}
                  className="block min-h-11 w-full accent-primary"
                />
              </label>
            ))}
            <Checkbox
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              disabled={pending}
              label={t('consent')}
            />
            <Link
              className="inline-flex min-h-11 items-center text-primary underline"
              href="/hukuki/profil-fotografi"
            >
              {t('readConsent')}
            </Link>
            {!consent && <p className="text-sm text-fg-muted">{t('consentRequired')}</p>}
            <Button
              type="submit"
              {...(!file || !consent
                ? { disabled: true as const, disabledReason: t('consentRequired') }
                : { disabled: false as const })}
              loading={pending}
              fullWidth
            >
              {t('save')}
            </Button>
          </>
        )}
      </form>
      {(granted || cleanupPending) && (
        <Button variant="secondary" onClick={() => void remove()} loading={pending} fullWidth>
          {t(cleanupPending ? 'cleanup' : 'remove')}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {errors(error)}
        </p>
      )}
      {notice && (
        <p role="status" className="text-fg">
          {notice}
        </p>
      )}
    </div>
  );
}
