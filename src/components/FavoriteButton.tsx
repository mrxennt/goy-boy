import { useAppState, toggleFavorite } from '../lib/store';

type Props = {
  gameId: string;
  label?: boolean;
  className?: string;
};

export function FavoriteButton({ gameId, label = false, className = '' }: Props) {
  const { favorites } = useAppState();
  const active = favorites.includes(gameId);
  return (
    <button
      type="button"
      className={`fav-btn ${active ? 'is-active' : ''} ${className}`.trim()}
      aria-pressed={active}
      aria-label={active ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
      title={active ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleFavorite(gameId);
      }}
    >
      <span className="fav-heart" aria-hidden>
        {active ? '♥' : '♡'}
      </span>
      {label ? <span>{active ? 'Favorit' : 'Merken'}</span> : null}
    </button>
  );
}
