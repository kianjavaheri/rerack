import { Dumbbell } from 'lucide-react';
import { useEffect, useState } from 'react';
import { exercisePhotos, loadExerciseInfo, loadRepdbInfo, thumbnailOf, type ExerciseInfo, type ExerciseMedia } from '../data/catalog';
import { Modal } from './Modal';

/** True when there's a picture to show (data/catalog.ts exerciseMedia). */
export const hasMedia = (media: ExerciseMedia) => !!thumbnailOf(media);

/**
 * An exercise's picture as a small square (RepDB's first picture, an anatomical GIF or a library photo, see MEDIA),
 * or a dumbbell when there's none or it fails to load (offline before it was ever seen).
 */
export function ExerciseThumb({ media, size = 40 }: { media: ExerciseMedia; size?: number | 'fill' }) {
  const [failed, setFailed] = useState<string | null>(null);
  const src = thumbnailOf(media);
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
      className={`exercise-thumb${media.gif ? ' anatomical' : media.frames ? ' illustration' : ''}`}
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
 * How the exercise is done: RepDB's pictures or the library's two photos (start and end of the movement) shown in turn
 * so they read like a short clip, or its anatomical GIF, then what it works and step-by-step instructions (library exercises) to
 * scroll and read. Opened from the picture on an exercise card.
 */
export function ExercisePhotos({ name, media, onClose }: { name: string; media: ExerciseMedia; onClose: () => void }) {
  const [shown, setShown] = useState(0);
  const [failed, setFailed] = useState(false);
  // undefined while loading, null when there's none (or offline).
  const [info, setInfo] = useState<ExerciseInfo | null | undefined>(media.repdbId || media.infoId ? undefined : null);
  useEffect(() => {
    if (!media.repdbId && !media.infoId) return;
    let live = true;
    (media.repdbId ? loadRepdbInfo(media.repdbId) : loadExerciseInfo(media.infoId!)).then((d) => live && setInfo(d));
    return () => {
      live = false;
    };
  }, [media.repdbId, media.infoId]);
  const frames = media.frames ?? (media.photoId && !media.gif ? exercisePhotos(media.photoId) : []);
  useEffect(() => {
    if (frames.length < 2) return;
    const id = setInterval(() => setShown((n) => 1 - n), 1100);
    return () => clearInterval(id);
  }, [frames.length]);
  return (
    <Modal title={name} onClose={onClose}>
      {failed ? (
        <p className="muted small">The pictures couldn’t load. Check your connection and try again.</p>
      ) : media.gif ? (
        <div className="exercise-gif">
          <img src={media.gif} alt={`How to do ${name}`} onError={() => setFailed(true)} />
        </div>
      ) : frames.length ? (
        <div className={`exercise-photos${media.frames ? ' illustration' : ''}`}>
          {frames.map((src, i) => (
            <img
              key={src}
              src={src}
              alt={frames.length === 1 ? name : i === 0 ? `${name}: start` : `${name}: end`}
              className={i === shown % frames.length ? 'on' : ''}
              onError={() => setFailed(true)}
            />
          ))}
        </div>
      ) : null}
      <p className="muted small" style={{ marginTop: 10 }}>
        {media.frames ? (
          <>
            {media.frames.length > 1 ? 'Start and end of the movement. ' : ''}Exercise data by{' '}
            <a href="https://repdb.co" target="_blank" rel="noopener noreferrer">
              RepDB (repdb.co)
            </a>
            .
          </>
        ) : media.gif ? (
          'Working muscles in red. Animation from ExerciseDB.'
        ) : (
          'Start and end of the movement. Photos from free-exercise-db.'
        )}
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
