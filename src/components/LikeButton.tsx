import { useStore } from '../data/storeContext'
import { Icon } from './Icon'
import { useToast } from './toastContext'

const plural = (n: number) => `${n} like${n > 1 ? 's' : ''}`

/**
 * Cœur et nombre de likes d'une photo. Appui : like / unlike (affiché aussitôt, annulé si la base
 * refuse). Ma photo : le nombre seul. Capturée : « aimée sur place » (cœur plein et épingle),
 * like qui ne se retire pas tant que la capture existe.
 */
export function LikeButton({
  photo,
  className = '',
}: {
  photo: { id: string; owner: string; likesCount: number }
  className?: string
}) {
  const { userId, likes, likeCounts, toggleLike } = useStore()
  const toast = useToast()
  const count = likeCounts.get(photo.id) ?? photo.likesCount
  const like = likes.get(photo.id)

  if (photo.owner === userId) {
    return (
      <span className={`like-btn mine ${count ? 'liked' : ''} ${className}`} aria-label={`Ma photo : ${plural(count)}`}>
        <Icon name="heart" size={18} />
        <span>{count}</span>
      </span>
    )
  }
  const label = like?.onSite
    ? `Capturée · aimée sur place (${plural(count)})`
    : like
      ? `Je n’aime plus (${plural(count)})`
      : `J’aime (${plural(count)})`
  return (
    <button
      type="button"
      className={`like-btn ${like ? 'liked' : ''} ${like?.onSite ? 'on-site' : ''} ${className}`}
      aria-pressed={!!like}
      aria-label={label}
      title={label}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        if (like?.onSite) {
          toast('Capturée · aimée sur place : ce like reste tant que la capture existe')
          return
        }
        toggleLike({ ...photo, likesCount: count }).catch((err: unknown) =>
          toast(err instanceof Error ? err.message : 'Like impossible'),
        )
      }}
    >
      <Icon name="heart" size={18} />
      {like?.onSite && <Icon name="pin" size={12} className="like-pin" />}
      <span>{count}</span>
    </button>
  )
}

/** Symbole d'une reproduction (version d'une autre photo). */
export function VersionBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`version-badge ${className}`} title="Reproduction d’une autre photo" aria-label="Reproduction">
      ↻
    </span>
  )
}
