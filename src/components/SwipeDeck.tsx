import type { KeyboardEvent, ReactNode } from 'react'
import { cycle } from '../geo/spots'
import { Dots } from './Dots'
import { useCardSwipe } from './useCardSwipe'

/**
 * Photos empilées, comme des profils sur Tinder : on fait glisser celle du
 * dessus pour découvrir la suivante (vers la gauche) ou revenir à la
 * précédente (vers la droite). Les points indiquent combien il y en a.
 */
export function SwipeDeck<T extends { id: string }>({
  items,
  index,
  onIndexChange,
  renderCard,
  label,
  className = '',
}: {
  items: T[]
  index: number
  onIndexChange: (index: number) => void
  renderCard: (item: T) => ReactNode
  label: string
  className?: string
}) {
  const n = items.length
  const swipe = useCardSwipe((step) => onIndexChange(cycle(index, step, n)))
  const top = items[index]
  // Sous la carte du dessus : celle qu'on va découvrir, selon le sens du geste.
  const dir = swipe.dx > 0 ? -1 : 1
  const below = [1, 2]
    .filter((k) => k < n)
    .map((k) => items[cycle(index, dir * k, n)])
    .filter((item, k, list) => item.id !== top.id && list.findIndex((o) => o.id === item.id) === k)

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowLeft') onIndexChange(cycle(index, -1, n))
    if (e.key === 'ArrowRight') onIndexChange(cycle(index, 1, n))
  }

  return (
    <div
      className={`deck ${className}`}
      role="group"
      aria-roledescription="pile de photos"
      aria-label={label}
      tabIndex={n > 1 ? 0 : undefined}
      onKeyDown={n > 1 ? onKeyDown : undefined}
    >
      <div className="deck-cards">
        {below
          .map((item, k) => {
            const depth = k + 1 - (k === 0 ? swipe.progress : 0)
            return (
              <div
                key={item.id}
                className="deck-card behind"
                style={{
                  transform: `translateY(${depth * 10}px) scale(${1 - depth * 0.05})`,
                  transition: swipe.transition,
                }}
                aria-hidden="true"
              >
                {renderCard(item)}
              </div>
            )
          })
          .reverse()}
        <div
          key={top.id}
          className="deck-card top"
          style={n > 1 ? { transform: swipe.transform, transition: swipe.transition } : undefined}
          {...(n > 1 ? swipe.handlers : {})}
        >
          {renderCard(top)}
        </div>
      </div>
      <Dots count={n} index={index} />
    </div>
  )
}
