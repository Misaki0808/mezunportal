'use client';

import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';

import { adminReason } from '@/contracts/admin';
import { Button, Field, Modal, Textarea } from '@/components/ui';
import type { ErrorCode } from '@/lib/errors';

type Props = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  /** Tehlikeli (geri alınamaz) işlem: onay düğmesi kırmızı çerçeveli. */
  danger?: boolean;
  /** Gerekçe istenmeyen onaylar (ör. geriye dönük hesaplama). */
  noReason?: boolean;
  /** Gerekçeden önce gösterilen ek alanlar. */
  children?: ReactNode;
  /** Ek alanlar geçersizse true. */
  blocked?: boolean;
  /** Başarısızsa hata kodu döner; başarılıysa `undefined` (pencere kapanır). */
  onSubmit: (reason: string) => Promise<ErrorCode | undefined>;
  onClose: () => void;
};

/** Gerekçeli onay penceresi (kural değişikliği, puan iptali, şüphe kararı, geriye dönük hesaplama). */
export function ReasonModal(props: Props) {
  const t = useTranslations('points.admin');
  const errors = useTranslations('errors.codes');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<ErrorCode>();

  function close() {
    if (pending) return;
    setReason('');
    setInvalid(false);
    setError(undefined);
    props.onClose();
  }

  async function submit() {
    if (pending) return;
    if (props.blocked || (!props.noReason && !adminReason.safeParse(reason).success)) {
      setInvalid(true);
      return;
    }
    setPending(true);
    setInvalid(false);
    setError(undefined);
    try {
      const failure = await props.onSubmit(reason.trim());
      if (failure) {
        setError(failure);
        return;
      }
      setReason('');
      props.onClose();
    } catch {
      setError('SERVER_UNEXPECTED');
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open={props.open}
      onClose={close}
      title={props.title}
      description={props.description}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            {t('cancel')}
          </Button>
          <Button
            variant={props.danger ? 'secondary' : 'primary'}
            className={props.danger ? 'border-danger text-danger' : undefined}
            loading={pending}
            onClick={() => void submit()}
          >
            {props.confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {props.children}
        {!props.noReason && (
          <Field
            label={t('reason')}
            hint={t('reasonHint')}
            required
            error={
              invalid && !adminReason.safeParse(reason).success ? t('reasonInvalid') : undefined
            }
          >
            {(field) => (
              <Textarea {...field} value={reason} onChange={(e) => setReason(e.target.value)} />
            )}
          </Field>
        )}
        {invalid && props.blocked && (
          <p role="alert" className="text-danger">
            {t('fieldsInvalid')}
          </p>
        )}
        {error && (
          <p role="alert" className="text-danger">
            {errors(error)}
          </p>
        )}
      </div>
    </Modal>
  );
}
