import { describe, expect, it } from 'vitest'
import { fromENU } from '../geo/geodesy'
import { reproduceStatus } from '../geo/reproduce'
import type { ViewPoint } from '../geo/views'
import { outOfViewMessage, preciseLocationText, reproduceAlert, vaguePositionMessage, viewpointAt } from './shotWarnings'

const origin = { lat: 46.1558, lon: -1.1522 }
const parent: ViewPoint = { position: origin, accuracy: 6, heading: 270, pitch: 0 }
const at = (east: number, heading = 270, pitch = 0, accuracy = 4) =>
  reproduceStatus({ position: fromENU(origin, [east, 0, 0]), heading, pitch, time: 0 }, parent, accuracy, null)

describe('avertissements de la prise de vue', () => {
  it('bandeau : rien dans la vue, orange au bord, rouge hors de la vue', () => {
    expect(reproduceAlert(at(1))).toBeNull()
    expect(reproduceAlert(at(5.5))).toEqual({ tone: 'warn', text: 'Revenez de 2 m' })
    expect(reproduceAlert(at(14))).toEqual({ tone: 'bad', text: 'Trop loin de la photo d’origine (14 m)' })
    expect(reproduceAlert(at(1, 240))?.text).toBe('Tournez-vous vers la droite')
    expect(reproduceAlert(at(1, 300))?.text).toBe('Tournez-vous vers la gauche')
    expect(reproduceAlert(at(1, 270, 25))?.text).toBe('Baissez le téléphone')
    expect(reproduceAlert(at(60))?.text).toBe('Vous avez quitté le lieu de la photo')
  })

  it('GPS imprécis : pas de « revenez de 2 m », mais toujours « trop loin »', () => {
    expect(reproduceAlert(at(8, 270, 0, 18))).toBeNull()
    expect(reproduceAlert(at(14, 270, 0, 18))?.tone).toBe('bad')
  })

  it('feuille hors de la vue : la distance, la limite et l’auteur', () => {
    expect(outOfViewMessage(at(14), 'Marie')).toBe(
      'Cette photo ne sera pas une reproduction : vous êtes à 14 m du point de vue de la photo de Marie (il faut être à moins de 6 m).',
    )
    // À 6,2 m d'un rayon de 6 m : jamais « à 6 m (il faut être à moins de 6 m) ».
    expect(outOfViewMessage(at(6.2), 'Alice')).toContain('à 7 m du point de vue de la photo d’Alice (il faut être à moins de 6 m)')
    expect(outOfViewMessage(at(1, 238), 'Marie')).toContain('même direction que la photo de Marie (32° d’écart, il faut moins de 20°)')
  })

  it('carte « lieu quitté » : où est le point de vue', () => {
    expect(viewpointAt(at(60))).toBe('Point de vue à 60 m vers le O')
  })

  it('feuille GPS imprécis', () => {
    expect(vaguePositionMessage(17.6)).toBe('Position imprécise (±18 m) : la photo risque d’être mal placée.')
  })
})

describe('position exacte', () => {
  it('dans l’app : réglages de PICTI ; dans Safari : réglages des sites web', () => {
    expect(preciseLocationText(true)).toContain('Réglages › PICTI › Position › Position exacte')
    expect(preciseLocationText(false)).toContain('Sites web Safari › Position exacte')
  })
})
