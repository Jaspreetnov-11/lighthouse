'use client';
// Clock-in / clock-out step: where are you working from (Office / WFH / On field) + front-camera selfie.
// Compresses the photo to a ~320px JPEG (10–15 KB). Resolves { selfie, mode } or null.
import { useEffect, useRef, useState } from 'react';
import { useUi } from '@/controllers/UiController';

const W = 320, H = 400, QUALITY = 0.55;
const MODES = [['office', '🏢', 'Office'], ['wfh', '🏠', 'Work from home'], ['field', '📍', 'On field']];

function toJpeg(source, sw, sh, mirror = false) {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const scale = Math.max(W / sw, H / sh);
  const dw = sw * scale, dh = sh * scale;
  if (mirror) {
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, (W - dw) / 2, (H - dh) / 2, dw, dh);
  return canvas.toDataURL('image/jpeg', QUALITY);
}

export function SelfieModal() {
  const { selfieRequest, resolveSelfie } = useUi();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef = useRef(null);
  const [shot, setShot] = useState('');
  const [err, setErr] = useState('');
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState('office');
  const needSelfie = !selfieRequest || selfieRequest.needSelfie !== false;
  const askMode = Boolean(selfieRequest && selfieRequest.askMode);

  useEffect(() => {
    if (!selfieRequest) return undefined;
    setShot(''); setErr(''); setReady(false); setMode(selfieRequest.defaultMode || 'office');
    if (selfieRequest.needSelfie === false) return undefined;
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('no-camera-api');
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 800 } }, audio: false });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}); }
        setReady(true);
      } catch (e) {
        setErr(e && e.name === 'NotAllowedError' ? 'Camera permission was denied. Allow the camera in your browser settings, or use the button below to take a photo.' : 'Camera not available here. Use the button below to take a photo.');
      }
    })();
    return () => { cancelled = true; if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; } };
  }, [selfieRequest]);

  if (!selfieRequest) return null;

  const stop = () => { if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; } };
  const capture = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) { setErr('Camera is still starting, try again.'); return; }
    setShot(toJpeg(v, v.videoWidth, v.videoHeight, true));
  };
  const fromFile = e => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const img = new Image();
    img.onload = () => setShot(toJpeg(img, img.naturalWidth, img.naturalHeight, false));
    img.onerror = () => setErr('Could not read that photo.');
    img.src = URL.createObjectURL(f);
  };
  const done = () => { stop(); resolveSelfie({ selfie: shot || '', mode }); };
  const cancel = () => { stop(); resolveSelfie(null); };
  const kb = shot ? Math.round((shot.length * 3) / 4 / 1024) : 0;
  const canFinish = needSelfie ? Boolean(shot) : true;

  return (
    <div className="scrim open" role="presentation" style={{ zIndex: 60 }}>
      <div className="dialog" role="dialog" aria-modal="true" style={{ maxWidth: 420, textAlign: 'center' }}>
        <div className="dialog-handle" onClick={cancel} title="Minimise sheet" role="button" tabIndex={0} />
        <div className="dialog-h">
          <div style={{ width: 36 }} />
          <h2 style={{ margin: 0 }}>{selfieRequest.title || 'Clock in'}</h2>
          <button type="button" className="dialog-close" onClick={cancel} aria-label="Close modal" title="Close">✕</button>
        </div>
        <p>{selfieRequest.sub || 'Your photo and location are saved with this punch.'}</p>
        {askMode && (
          <div className="mode-pick">
            {MODES.map(([k, ic, l]) => <button key={k} type="button" className={mode === k ? 'on' : ''} onClick={() => setMode(k)}><span>{ic}</span>{l}</button>)}
          </div>
        )}
        {needSelfie && (
          <>
            <div className="selfie-frame">
              {shot ? <img src={shot} alt="Your selfie" /> : <video ref={videoRef} playsInline muted autoPlay style={{ display: err ? 'none' : 'block' }} />}
              {!shot && err && <div className="selfie-err">{err}</div>}
              {!shot && !err && !ready && <div className="selfie-err">Starting camera…</div>}
            </div>
            {shot && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>{kb} KB</div>}
            <input ref={fileRef} type="file" accept="image/*" capture="user" onChange={fromFile} hidden />
          </>
        )}
        <div className="row" style={{ justifyContent: 'center', marginTop: 14, gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost" onClick={cancel}>Cancel</button>
          {needSelfie && !shot && !err && <button type="button" className="btn btn-primary" onClick={capture} disabled={!ready}>📷 Capture</button>}
          {needSelfie && !shot && err && <button type="button" className="btn btn-primary" onClick={() => fileRef.current && fileRef.current.click()}>📷 Take photo</button>}
          {needSelfie && shot && <button type="button" className="btn btn-ghost" onClick={() => setShot('')}>Retake</button>}
          {canFinish && <button type="button" className="btn btn-primary" onClick={done}>{selfieRequest.okLabel || 'Continue'}</button>}
        </div>
      </div>
    </div>
  );
}
