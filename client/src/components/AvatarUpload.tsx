'use client';

import React, { useCallback, useRef, useState } from 'react';
import ReactCrop, { centerCrop, makeAspectCrop, type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Upload, Trash2 } from 'lucide-react';
import { uploadAvatar as apiUploadAvatar, deleteAvatar as apiDeleteAvatar } from '../services/api';
import Avatar from './Avatar';

interface AvatarUploadProps {
  username: string;
  avatarUrl: string | null;
  avatarUrlSm: string | null;
  onChange: (next: { avatarUrl: string | null; avatarUrlSm: string | null }) => void;
}

const MAX_INPUT_BYTES = 4 * 1024 * 1024;
const CROP_OUTPUT_PX = 512; // upload at 2× display size for retina sharpness
const ACCEPT = 'image/jpeg,image/png,image/webp';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error ?? new Error('Read failed'));
    fr.readAsDataURL(file);
  });
}

function canvasFromCrop(image: HTMLImageElement, crop: PixelCrop): HTMLCanvasElement {
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  const canvas = document.createElement('canvas');
  canvas.width = CROP_OUTPUT_PX;
  canvas.height = CROP_OUTPUT_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unsupported');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0,
    0,
    CROP_OUTPUT_PX,
    CROP_OUTPUT_PX,
  );
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Encode failed'))),
      'image/webp',
      0.9,
    );
  });
}

const AvatarUpload: React.FC<AvatarUploadProps> = ({ username, avatarUrl, avatarUrlSm, onChange }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop | undefined>(undefined);
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onPickFile = useCallback(async (file: File) => {
    setErr(null);
    if (file.size > MAX_INPUT_BYTES) {
      setErr('Image is too large (max 4 MB).');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setErr('Only JPEG, PNG, or WebP images are allowed.');
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setSrc(dataUrl);
      setCrop(undefined);
      setCompletedCrop(undefined);
    } catch {
      setErr('Could not read this file.');
    }
  }, []);

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    const initial = centerCrop(
      makeAspectCrop({ unit: '%', width: 90 }, 1, width, height),
      width,
      height,
    );
    setCrop(initial);
  }, []);

  const cancelCrop = useCallback(() => {
    setSrc(null);
    setCrop(undefined);
    setCompletedCrop(undefined);
    setErr(null);
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  const submitCrop = useCallback(async () => {
    if (!imgRef.current || !completedCrop || completedCrop.width === 0) {
      setErr('Select a crop area.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const canvas = canvasFromCrop(imgRef.current, completedCrop);
      const blob = await canvasToBlob(canvas);
      const { data } = await apiUploadAvatar(blob);
      onChange({ avatarUrl: data.avatarUrl ?? null, avatarUrlSm: data.avatarUrlSm ?? null });
      cancelCrop();
    } catch (e) {
      setErr((e as Error).message || 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }, [completedCrop, onChange, cancelCrop]);

  const onRemove = useCallback(async () => {
    if (!avatarUrl) return;
    if (!window.confirm('Remove your custom avatar?')) return;
    setBusy(true);
    setErr(null);
    try {
      await apiDeleteAvatar();
      onChange({ avatarUrl: null, avatarUrlSm: null });
    } catch (e) {
      setErr((e as Error).message || 'Could not remove avatar.');
    } finally {
      setBusy(false);
    }
  }, [avatarUrl, onChange]);

  return (
    <div className="vx-avatar-upload">
      <div className="vx-avatar-upload__row">
        <Avatar username={username} avatarUrl={avatarUrl} avatarUrlSm={avatarUrlSm} size="lg" ariaHidden />
        <div className="vx-avatar-upload__info">
          <div className="vx-avatar-upload__title">Custom avatar</div>
          <div className="vx-avatar-upload__desc">
            Square image, JPEG / PNG / WebP, up to 4 MB. Crop tool will square it for you.
          </div>
          <div className="vx-avatar-upload__actions">
            <button
              type="button"
              className="vx-avatar-upload__btn vx-avatar-upload__btn--primary"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              <Upload size={14} aria-hidden="true" />
              <span>{avatarUrl ? 'Replace' : 'Upload'}</span>
            </button>
            {avatarUrl && (
              <button
                type="button"
                className="vx-avatar-upload__btn vx-avatar-upload__btn--danger"
                onClick={onRemove}
                disabled={busy}
              >
                <Trash2 size={14} aria-hidden="true" />
                <span>Remove</span>
              </button>
            )}
          </div>
          {err && <div className="vx-avatar-upload__err">{err}</div>}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onPickFile(f);
        }}
      />

      {src && (
        <div className="vx-avatar-upload__modal" role="dialog" aria-modal="true" aria-label="Crop avatar">
          <div className="vx-avatar-upload__modal-inner">
            <div className="vx-avatar-upload__modal-title">Crop avatar</div>
            <div className="vx-avatar-upload__crop">
              <ReactCrop
                crop={crop}
                onChange={(c) => setCrop(c)}
                onComplete={(c) => setCompletedCrop(c)}
                aspect={1}
                circularCrop={false}
                keepSelection
                minWidth={32}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img ref={imgRef} src={src} alt="" onLoad={onImageLoad} style={{ maxHeight: '60vh' }} />
              </ReactCrop>
            </div>
            {err && <div className="vx-avatar-upload__err">{err}</div>}
            <div className="vx-avatar-upload__modal-actions">
              <button
                type="button"
                className="vx-avatar-upload__btn"
                onClick={cancelCrop}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="vx-avatar-upload__btn vx-avatar-upload__btn--primary"
                onClick={submitCrop}
                disabled={busy || !completedCrop || completedCrop.width === 0}
              >
                {busy ? 'Uploading…' : 'Save avatar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AvatarUpload;
