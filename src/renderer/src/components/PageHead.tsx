import { BackIcon } from './icons';

/** Heading of a Pegel page with the back arrow to the music. */
export function PageHead({ title }: { title: string }) {
  return (
    <div className="page-head">
      <button
        className="back"
        aria-label="Zurück zur Musik"
        title="Zurück (Esc)"
        onClick={() => window.pegel.showView('music')}
      >
        <BackIcon />
      </button>
      <h2>{title}</h2>
    </div>
  );
}
