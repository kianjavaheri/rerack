import { Dumbbell } from 'lucide-react';
import { useEffect, useState } from 'react';
import { exercisePhotos, loadExerciseInfo, type ExerciseInfo, type ExerciseMedia } from '../data/catalog';
import { Modal } from './Modal';

/** True when there's a picture to show (data/catalog.ts exerciseMedia). */
export const hasMedia = (media: ExerciseMedia) => !!(media.gif || media.photoId);

/**
 * An exercise's picture as a small square (its anatomical GIF while that's on, else its library photo), or a dumbbell
 * when there's none or it fails to load (offline before it was ever seen).
 */
export function ExerciseThumb({ media, size = 40 }: { media: ExerciseMedia; size?: number | 'fill' }) {
  const [failed, setFailed] = useState<string | null>(null);
  const src = media.gif ?? (media.photoId ? exercisePhotos(media.photoId)[0] : undefined);
  // 'fill': as wide as its box, square (the exercise grid's tiles).
  const style = size === 'fill' ? { width: '100%', height: 'auto', aspectRatio: '1' } : { width: size, height: size };
  if (!src || failed === src) {
    return (
      <span className="exercise-thumb no-picture" style={style} aria-hidden>
        <Dumbbell size={size === 'fill' ? 28 : size * 0.42} />
      </span>
    );
  }
  return (
    <img
      className={`exercise-thumb${media.gif ? ' anatomical' : ''}`}
      style={style}
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(src)}
    />
  );
}

/**
 * How the exercise is done: its anatomical GIF, or its two library photos (start and end of the movement) shown in
 * turn so they read like a short clip, then what it works and step-by-step instructions (library exercises) to
 * scroll and read. Opened from the picture on an exercise card.
 */
export function ExercisePhotos({ name, media, onClose }: { name: string; media: ExerciseMedia; onClose: () => void }) {
  const [shown, setShown] = useState(0);
  const [failed, setFailed] = useState(false);
  // undefined while loading, null when there's none (or offline).
  const [info, setInfo] = useState<ExerciseInfo | null | undefined>(media.infoId ? undefined : null);
  useEffect(() => {
    if (!media.infoId) return;
    let live = true;
    loadExerciseInfo(media.infoId).then((d) => live && setInfo(d));
    return () => {
      live = false;
    };
  }, [media.infoId]);
  useEffect(() => {
    if (media.gif) return;
    const id = setInterval(() => setShown((n) => 1 - n), 1100);
    return () => clearInterval(id);
  }, [media.gif]);
  return (
    <Modal title={name} onClose={onClose}>
      {failed ? (
        <p className="muted small">The pictures couldn’t load. Check your connection and try again.</p>
      ) : media.gif ? (
        <div className="exercise-gif">
          <img src={media.gif} alt={`How to do ${name}`} onError={() => setFailed(true)} />
        </div>
      ) : media.photoId ? (
        <div className="exercise-photos">
          {exercisePhotos(media.photoId).map((src, i) => (
            <img key={src} src={src} alt={i === 0 ? `${name}: start` : `${name}: end`} className={i === shown ? 'on' : ''} onError={() => setFailed(true)} />
          ))}
        </div>
      ) : null}
      <p className="muted small" style={{ marginTop: 10 }}>
        {media.gif ? 'Working muscles in red. Animation from ExerciseDB.' : 'Start and end of the movement. Photos from free-exercise-db.'}
      </p>
      {info && (
        <div className="exercise-info">
          {info.primaryMuscles.length > 0 && (
            <p className="exercise-muscles">
              <strong>Works</strong> {[...info.primaryMuscles, ...info.secondaryMuscles].join(' · ')}
            </p>
          )}
          {info.instructions.length > 0 && (
            <>
              <h3 className="exercise-info-title">How to do it</h3>
              <ol className="exercise-steps">
                {info.instructions.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}
      {info === undefined && <p className="muted small">Loading instructions…</p>}
    </Modal>
  );
}
