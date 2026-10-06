import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { photoTime } from '../components/arProjection'
import type { GeoPoint } from '../geo/geodesy'
import { SPOT_RADIUS_MAX } from '../geo/spots'
import { capVisibility, chooseParent, sameView } from '../geo/views'
import { NEARBY_RADIUS } from '../config'
import { forgetImage, primeImage, registerImagePaths } from './imageUrls'
import { normalizeFriendCode } from './invite'
import { viewOf } from './photoSpots'
import type { PhotoDraft } from './pipeline'
import {
  PHOTO_SELECT,
  PROFILE_SELECT,
  photoToRow,
  profileChangesToRow,
  rowToCapture,
  rowToPhoto,
  rowToProfile,
  storagePaths,
  type CaptureRow,
  type PhotoRow,
  type ProfileRow,
} from './rows'
import { StoreContext, type Store } from './storeContext'
import { PHOTO_BUCKET, supabase } from './supabase'
import {
  isGeoframed,
  type AppNotification,
  type Capture,
  type Friendship,
  type GeoPhoto,
  type Liker,
  type MyLike,
  type PersonResult,
  type Profile,
  type ProfileChanges,
  type Visibility,
} from './types'

type FriendRow = {
  requester: string
  addressee: string
  status: 'pending' | 'accepted'
  requester_profile: { name: string; city: string } | null
  addressee_profile: { name: string; city: string } | null
}

function fail(error: { message: string } | null, context: string): void {
  if (error) throw new Error(`${context} : ${error.message}`)
}

type NotificationRow = {
  id: string
  kind: AppNotification['kind']
  photo_id: string
  actor: string
  created_at: string
  read_at: string | null
  actor_profile: { name: string } | null
  photo: { thumb_path: string } | null
}

const NOTIFICATION_SELECT =
  'id, kind, photo_id, actor, created_at, read_at, actor_profile:profiles!notifications_actor_fkey(name), photo:photos(thumb_path)'

const rowToNotification = (r: NotificationRow): AppNotification => ({
  id: r.id,
  kind: r.kind,
  photoId: r.photo_id,
  thumbPath: r.photo?.thumb_path ?? null,
  actorId: r.actor,
  actorName: r.actor_profile?.name ?? '',
  createdAt: Date.parse(r.created_at),
  read: r.read_at != null,
})

/** Sans temps réel (connexion coupée…), la liste des notifications est relue à cet intervalle (ms). */
const NOTIFICATION_POLL_MS = 60_000

async function fetchNotifications(userId: string): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select(NOTIFICATION_SELECT)
    .eq('recipient', userId)
    .order('created_at', { ascending: false })
    .limit(100)
  fail(error, 'Notifications')
  return ((data ?? []) as unknown as NotificationRow[]).map(rowToNotification)
}

/** Refus de la base sur la photo parente (vue, visibilité) : on réessaie sans la rattacher. */
const versionRefused = (message: string) => /version|parente/i.test(message)

async function fetchFriends(userId: string): Promise<Friendship[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select(
      'requester, addressee, status, ' +
        'requester_profile:profiles!friendships_requester_fkey(name, city), ' +
        'addressee_profile:profiles!friendships_addressee_fkey(name, city)',
    )
  fail(error, 'Amis')
  return ((data ?? []) as unknown as FriendRow[]).map((r) => {
    const outgoing = r.requester === userId
    const other = outgoing ? r.addressee_profile : r.requester_profile
    return {
      userId: outgoing ? r.addressee : r.requester,
      name: other?.name ?? '',
      city: other?.city ?? '',
      status: r.status,
      outgoing,
    }
  })
}

/** Données de l'utilisateur connecté, synchronisées avec Supabase. */
export function StoreProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [photoMap, setPhotoMap] = useState<Map<string, GeoPhoto>>(() => new Map())
  const [nearby, setNearby] = useState<Map<string, number>>(() => new Map())
  const [captures, setCaptures] = useState<Capture[]>([])
  const [hunters, setHunters] = useState<Capture[]>([])
  const [friends, setFriends] = useState<Friendship[]>([])
  const [likes, setLikes] = useState<Map<string, MyLike>>(() => new Map())
  // Nombre de likes des photos qui ne sont pas dans le store (carte), après mes likes.
  const [likeCounts, setLikeCounts] = useState<Map<string, number>>(() => new Map())
  const [notifications, setNotifications] = useState<AppNotification[]>([])

  const mergePhotos = useCallback((list: GeoPhoto[]) => {
    registerImagePaths(list)
    setPhotoMap((prev) => {
      const next = new Map(prev)
      list.forEach((p) => next.set(p.id, p))
      return next
    })
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [prof, mine, caps, hunts, fr, myLikes, notifs] = await Promise.all([
        supabase.from('profiles').select(PROFILE_SELECT).eq('id', userId).single(),
        supabase.from('photos').select(PHOTO_SELECT).eq('owner', userId).order('created_at', { ascending: false }),
        supabase
          .from('captures')
          .select(`*, photo:photos(${PHOTO_SELECT})`)
          .eq('hunter', userId)
          .order('captured_at', { ascending: false }),
        supabase
          .from('captures')
          .select('*, hunter_profile:profiles!captures_hunter_fkey(name), photo:photos!inner(owner)')
          .eq('photo.owner', userId)
          .neq('hunter', userId)
          .order('captured_at', { ascending: false }),
        fetchFriends(userId),
        supabase.from('photo_likes').select('photo_id, on_site').eq('user_id', userId),
        fetchNotifications(userId).catch(() => [] as AppNotification[]),
      ])
      fail(prof.error, 'Profil')
      fail(mine.error, 'Photos')
      fail(caps.error, 'Captures')
      fail(hunts.error, 'Chasseurs')
      if (!alive) return
      const captured = (caps.data as unknown as (CaptureRow & { photo: PhotoRow | null })[]).filter((c) => c.photo)
      mergePhotos([
        ...(mine.data as unknown as PhotoRow[]).map(rowToPhoto),
        ...captured.map((c) => rowToPhoto(c.photo!)),
      ])
      setProfile(rowToProfile(prof.data as unknown as ProfileRow))
      setCaptures(captured.map(rowToCapture))
      setHunters((hunts.data as unknown as CaptureRow[]).map(rowToCapture))
      setFriends(fr)
      setLikes(
        new Map(((myLikes.data ?? []) as { photo_id: string; on_site: boolean }[]).map((l) => [l.photo_id, { onSite: l.on_site }])),
      )
      setNotifications(notifs)
    })()
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setReady(true))
    return () => {
      alive = false
    }
  }, [userId, mergePhotos])

  /** Nombre de likes d'une photo, après un de mes likes (store et photos de la carte). */
  const adjustLikeCount = useCallback((photoId: string, delta: number, known: number) => {
    setPhotoMap((prev) => {
      const photo = prev.get(photoId)
      if (!photo) return prev
      const next = new Map(prev)
      next.set(photoId, { ...photo, likesCount: Math.max(0, photo.likesCount + delta) })
      return next
    })
    setLikeCounts((prev) => new Map(prev).set(photoId, Math.max(0, (prev.get(photoId) ?? known) + delta)))
  }, [])

  const photos = useMemo(() => [...photoMap.values()].sort((a, b) => b.addedAt - a.addedAt), [photoMap])
  const myPhotos = useMemo(() => photos.filter((p) => p.owner === userId), [photos, userId])
  const isMine = useCallback((p: GeoPhoto) => p.owner === userId, [userId])

  const loadPhoto = useCallback(
    async (id: string) => {
      const known = photoMap.get(id)
      if (known) return known
      const { data } = await supabase.from('photos').select(PHOTO_SELECT).eq('id', id).maybeSingle()
      if (!data) return null
      const photo = rowToPhoto(data as unknown as PhotoRow)
      mergePhotos([photo])
      return photo
    },
    [photoMap, mergePhotos],
  )

  const refreshNearby = useCallback(
    async (position: GeoPoint) => {
      const { data, error: e } = await supabase.rpc('nearby_photos', {
        p_lat: position.lat,
        p_lon: position.lon,
        p_radius: NEARBY_RADIUS,
      })
      if (e || !data) return
      const rows = data as { id: string; distance: number }[]
      const missing = rows.map((r) => r.id).filter((id) => !photoMap.has(id))
      if (missing.length) {
        const { data: full } = await supabase.from('photos').select(PHOTO_SELECT).in('id', missing)
        if (full) mergePhotos((full as unknown as PhotoRow[]).map(rowToPhoto))
      }
      setNearby(new Map(rows.map((r) => [r.id, r.distance])))
    },
    [photoMap, mergePhotos],
  )

  /**
   * Photo parente d'une nouvelle photo géocadrée (version) et visibilité qui en découle :
   * - `explicit` (bouton « Reproduire ») : cette photo, si la nouvelle est bien dans sa vue ; la
   *   visibilité est alors ramenée à celle de l'originale au plus ;
   * - sinon, la photo de la même vue que j'ai capturée le plus récemment, ou la plus ancienne.
   */
  const versionParent = useCallback(
    (draft: PhotoDraft, visibility: Visibility, explicit: string | null | undefined) => {
      const photo = { ...draft, visibility } as GeoPhoto
      if (explicit === null || !isGeoframed(photo)) return { versionOf: null, visibility }
      const view = viewOf(photo)
      const target = explicit ? photoMap.get(explicit) : undefined
      if (target && isGeoframed(target) && target.visibility !== 'prive' && sameView(view, viewOf(target))) {
        return { versionOf: target.id, visibility: capVisibility(visibility, target.visibility) }
      }
      const candidates = [...photoMap.values()].filter(isGeoframed).map((p) => ({
        id: p.id,
        view: viewOf(p),
        visibility: p.visibility,
        time: photoTime(p),
      }))
      const capturedAt = new Map(captures.map((c) => [c.photoId, c.capturedAt]))
      return { versionOf: chooseParent({ view, visibility }, candidates, capturedAt), visibility }
    },
    [photoMap, captures],
  )

  const addPhoto = useCallback(
    async (
      draft: PhotoDraft,
      images: { full: Blob; thumb: Blob },
      options: { visibility?: Visibility; versionOf?: string | null } = {},
    ) => {
      // Sans choix explicite (pastille du viseur, import) : le réglage du profil, « amis » par défaut.
      const chosen = options.visibility ?? profile?.defaultVisibility ?? 'amis'
      const { versionOf, visibility } = versionParent(draft, chosen, options.versionOf)
      const { imagePath, thumbPath } = storagePaths(userId, draft.id, images.full.type || 'image/jpeg')
      const bucket = supabase.storage.from(PHOTO_BUCKET)
      const [up1, up2] = await Promise.all([
        bucket.upload(imagePath, images.full, { contentType: images.full.type || 'image/jpeg' }),
        bucket.upload(thumbPath, images.thumb, { contentType: 'image/jpeg' }),
      ])
      try {
        fail(up1.error, 'Envoi de la photo')
        fail(up2.error, 'Envoi de la vignette')
        const photo: GeoPhoto = {
          ...draft,
          owner: userId,
          ownerName: profile?.name ?? '',
          visibility,
          imagePath,
          thumbPath,
          likesCount: 0,
          versionOf,
          versionsCount: 0,
        }
        const insert = (p: GeoPhoto) => supabase.from('photos').insert(photoToRow(p)).select(PHOTO_SELECT).single()
        let result = await insert(photo)
        // Parente refusée par la base (vue, visibilité changée entre-temps) : la photo compte plus
        // que son rattachement.
        if (result.error && versionOf && versionRefused(result.error.message)) result = await insert({ ...photo, versionOf: null })
        fail(result.error, 'Enregistrement de la photo')
        const saved = rowToPhoto(result.data as unknown as PhotoRow)
        primeImage(imagePath, images.full)
        primeImage(thumbPath, images.thumb)
        mergePhotos([saved])
        // La parente compte une version de plus (tenu par la base).
        if (saved.versionOf) {
          setPhotoMap((prev) => {
            const parent = prev.get(saved.versionOf!)
            if (!parent) return prev
            const next = new Map(prev)
            next.set(parent.id, { ...parent, versionsCount: parent.versionsCount + 1 })
            return next
          })
        }
        return saved
      } catch (err) {
        await bucket.remove([imagePath, thumbPath])
        throw err
      }
    },
    [userId, profile, mergePhotos, versionParent],
  )

  const updatePhoto = useCallback(
    async (photo: GeoPhoto) => {
      const { id, ...changes } = photoToRow(photo)
      const { data, error: e } = await supabase.from('photos').update(changes).eq('id', id).select(PHOTO_SELECT).single()
      fail(e, 'Mise à jour de la photo')
      mergePhotos([rowToPhoto(data as unknown as PhotoRow)])
    },
    [mergePhotos],
  )

  const removePhoto = useCallback(
    async (id: string) => {
      const photo = photoMap.get(id)
      const { error: e } = await supabase.from('photos').delete().eq('id', id)
      fail(e, 'Suppression')
      if (photo) {
        await supabase.storage.from(PHOTO_BUCKET).remove([photo.imagePath, photo.thumbPath])
        forgetImage(photo.imagePath)
        forgetImage(photo.thumbPath)
      }
      setPhotoMap((prev) => {
        const next = new Map(prev)
        next.delete(id)
        return next
      })
      setCaptures((prev) => prev.filter((c) => c.photoId !== id))
      setHunters((prev) => prev.filter((c) => c.photoId !== id))
    },
    [photoMap],
  )

  const addCapture = useCallback(
    async (photoId: string, score: number) => {
      const { data, error: e } = await supabase
        .from('captures')
        .upsert({ photo_id: photoId, score }, { onConflict: 'photo_id,hunter', ignoreDuplicates: true })
        .select('*')
      fail(e, 'Capture')
      const rows = (data ?? []) as CaptureRow[]
      if (rows.length) setCaptures((prev) => [rowToCapture(rows[0]), ...prev.filter((c) => c.photoId !== photoId)])
      // Capturer = liker sur place (fait par la base) : un like de plus, sauf si je l'aimais déjà.
      const photo = photoMap.get(photoId)
      if (!rows.length || !photo || photo.owner === userId) return
      const before = likes.get(photoId)
      setLikes((prev) => new Map(prev).set(photoId, { onSite: true }))
      if (!before) adjustLikeCount(photoId, 1, photo.likesCount)
    },
    [photoMap, likes, userId, adjustLikeCount],
  )

  const saveProfile = useCallback(
    async (changes: ProfileChanges) => {
      const { error: e } = await supabase.from('profiles').update(profileChangesToRow(changes)).eq('id', userId)
      fail(e, 'Profil')
      setProfile((p) => (p ? { ...p, ...changes } : p))
    },
    [userId],
  )

  const reloadFriends = useCallback(async () => setFriends(await fetchFriends(userId)), [userId])

  // Demandes reçues pendant que l'app était en arrière-plan : relues au retour.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') reloadFriends().catch(() => undefined)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [reloadFriends])

  const findByFriendCode = useCallback(async (rawCode: string) => {
    const code = normalizeFriendCode(rawCode)
    if (!code) return null
    const { data, error: e } = await supabase.from('profiles').select('id, name, city').eq('friend_code', code).maybeSingle()
    fail(e, 'Invitation')
    return (data as PersonResult | null) ?? null
  }, [])

  /** Demande d'ami, ou acceptation si l'autre m'a déjà demandé. */
  const befriend = useCallback(
    async (other: { id: string; name: string }) => {
      if (other.id === userId) return 'C’est votre propre compte !'
      const existing = friends.find((f) => f.userId === other.id)
      if (existing?.status === 'accepted') return `${other.name} est déjà votre ami.`
      if (existing && !existing.outgoing) {
        const { error: e } = await supabase
          .from('friendships')
          .update({ status: 'accepted' })
          .eq('requester', other.id)
          .eq('addressee', userId)
        fail(e, 'Ami')
        await reloadFriends()
        return `Vous êtes maintenant ami avec ${other.name}.`
      }
      if (existing) return `Demande déjà envoyée à ${other.name}.`
      const { error: e } = await supabase.from('friendships').insert({ requester: userId, addressee: other.id })
      fail(e, 'Demande d’ami')
      await reloadFriends()
      return `Demande envoyée à ${other.name}.`
    },
    [friends, userId, reloadFriends],
  )

  const addFriend = useCallback(
    async (rawCode: string) => {
      const code = normalizeFriendCode(rawCode)
      if (!code) return 'Saisissez le code de votre ami.'
      if (code === profile?.friendCode) return 'C’est votre propre code !'
      const other = await findByFriendCode(code)
      if (!other) return 'Aucun utilisateur avec ce code.'
      return befriend(other)
    },
    [profile, findByFriendCode, befriend],
  )

  const searchPeople = useCallback(async (query: string) => {
    if (query.trim().length < 3) return []
    const { data, error: e } = await supabase.rpc('search_profiles', { p_query: query.trim() })
    fail(e, 'Recherche')
    return (data ?? []) as PersonResult[]
  }, [])

  const acceptFriend = useCallback(
    async (otherId: string) => {
      const { error: e } = await supabase
        .from('friendships')
        .update({ status: 'accepted' })
        .eq('requester', otherId)
        .eq('addressee', userId)
      fail(e, 'Ami')
      await reloadFriends()
    },
    [userId, reloadFriends],
  )

  const removeFriend = useCallback(
    async (otherId: string) => {
      const { error: e } = await supabase
        .from('friendships')
        .delete()
        .or(`and(requester.eq.${userId},addressee.eq.${otherId}),and(requester.eq.${otherId},addressee.eq.${userId})`)
      fail(e, 'Ami')
      await reloadFriends()
    },
    [userId, reloadFriends],
  )

  /**
   * Like / unlike d'une photo d'un autre, affiché aussitôt et annulé si la base refuse. Le like
   * d'une capture (« aimée sur place ») ne se retire pas.
   */
  const toggleLike = useCallback(
    async (photo: { id: string; owner: string; likesCount: number }) => {
      if (photo.owner === userId) return
      const mine = likes.get(photo.id)
      if (mine?.onSite) throw new Error('Capturée : aimée sur place, ce like reste')
      const known = likeCounts.get(photo.id) ?? photoMap.get(photo.id)?.likesCount ?? photo.likesCount
      const setMine = (like: MyLike | null) =>
        setLikes((prev) => {
          const next = new Map(prev)
          if (like) next.set(photo.id, like)
          else next.delete(photo.id)
          return next
        })
      setMine(mine ? null : { onSite: false })
      adjustLikeCount(photo.id, mine ? -1 : 1, known)
      const { error: e } = mine
        ? await supabase.from('photo_likes').delete().eq('photo_id', photo.id).eq('user_id', userId)
        : await supabase.from('photo_likes').insert({ photo_id: photo.id })
      if (e) {
        setMine(mine ?? null)
        adjustLikeCount(photo.id, mine ? 1 : -1, known)
        fail(e, mine ? 'Retirer le like' : 'Like')
      }
    },
    [userId, likes, likeCounts, photoMap, adjustLikeCount],
  )

  /** Qui a aimé ma photo (l'auteur seulement voit la liste). */
  const fetchLikers = useCallback(async (photoId: string): Promise<Liker[]> => {
    const { data, error: e } = await supabase
      .from('photo_likes')
      .select('user_id, on_site, created_at, liker:profiles!photo_likes_user_id_fkey(name)')
      .eq('photo_id', photoId)
      .order('created_at', { ascending: false })
    fail(e, 'Likes')
    type Row = { user_id: string; on_site: boolean; created_at: string; liker: { name: string } | null }
    return ((data ?? []) as unknown as Row[]).map((r) => ({
      userId: r.user_id,
      name: r.liker?.name ?? '',
      onSite: r.on_site,
      likedAt: Date.parse(r.created_at),
    }))
  }, [])

  /** Toutes les photos (que je peux voir) d'un lieu : pour la galerie, ouverte aussi depuis la carte. */
  const loadSpot = useCallback(
    async (position: GeoPoint) => {
      const { data, error: e } = await supabase.rpc('nearby_photos', {
        p_lat: position.lat,
        p_lon: position.lon,
        p_radius: SPOT_RADIUS_MAX,
      })
      if (e || !data) return
      const missing = (data as { id: string }[]).map((r) => r.id).filter((id) => !photoMap.has(id))
      if (!missing.length) return
      const { data: full } = await supabase.from('photos').select(PHOTO_SELECT).in('id', missing)
      if (full) mergePhotos((full as unknown as PhotoRow[]).map(rowToPhoto))
    },
    [photoMap, mergePhotos],
  )

  /** Versions (reproductions) d'une photo que je peux voir, les plus récentes d'abord. */
  const loadVersions = useCallback(
    async (photoId: string) => {
      const { data, error: e } = await supabase
        .from('photos')
        .select(PHOTO_SELECT)
        .eq('version_of', photoId)
        .order('created_at', { ascending: false })
      fail(e, 'Reproductions')
      const list = ((data ?? []) as unknown as PhotoRow[]).map(rowToPhoto)
      mergePhotos(list)
      return list
    },
    [mergePhotos],
  )

  const reloadNotifications = useCallback(async () => {
    setNotifications(await fetchNotifications(userId))
  }, [userId])

  const markNotificationsRead = useCallback(
    async (ids: string[]) => {
      const unread = new Set(notifications.filter((n) => !n.read && ids.includes(n.id)).map((n) => n.id))
      if (!unread.size) return
      setNotifications((prev) => prev.map((n) => (unread.has(n.id) ? { ...n, read: true } : n)))
      const { error: e } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .in('id', [...unread])
      if (e) setNotifications((prev) => prev.map((n) => (unread.has(n.id) ? { ...n, read: false } : n)))
    },
    [notifications],
  )

  // Nouvelles notifications : en temps réel (Supabase Realtime) ; à défaut, relues toutes les
  // minutes. Dans tous les cas, au retour dans l'app.
  const live = useRef(false)
  useEffect(() => {
    const refresh = () => void reloadNotifications().catch(() => undefined)
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient=eq.${userId}` },
        refresh,
      )
      .subscribe((status) => {
        live.current = status === 'SUBSCRIBED'
      })
    const poll = setInterval(() => {
      if (!live.current && document.visibilityState === 'visible') refresh()
    }, NOTIFICATION_POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisible)
      void supabase.removeChannel(channel)
    }
  }, [userId, reloadNotifications])

  const redeemPremiumCode = useCallback(async (code: string) => {
    if (!code.trim()) return { ok: false, message: 'Saisissez votre code.' }
    const { data, error: e } = await supabase.rpc('redeem_premium_code', { p_code: code })
    fail(e, 'Code Premium')
    if (data === 'premium') {
      setProfile((p) => (p ? { ...p, plan: 'premium' } : p))
      return { ok: true, message: 'Bienvenue dans PICTI Premium !' }
    }
    if (data === 'trop-de-tentatives') return { ok: false, message: 'Trop de tentatives : réessayez dans une heure.' }
    return { ok: false, message: 'Code invalide.' }
  }, [])

  const value = useMemo<Store>(
    () => ({
      userId,
      ready,
      error,
      profile,
      photos,
      myPhotos,
      nearby,
      captures,
      hunters,
      friends,
      likes,
      likeCounts,
      notifications,
      isMine,
      loadPhoto,
      refreshNearby,
      loadSpot,
      loadVersions,
      addPhoto,
      updatePhoto,
      removePhoto,
      addCapture,
      saveProfile,
      addFriend,
      requestFriend: befriend,
      findByFriendCode,
      searchPeople,
      acceptFriend,
      removeFriend,
      redeemPremiumCode,
      toggleLike,
      fetchLikers,
      reloadNotifications,
      markNotificationsRead,
    }),
    [
      userId,
      ready,
      error,
      profile,
      photos,
      myPhotos,
      nearby,
      captures,
      hunters,
      friends,
      likes,
      likeCounts,
      notifications,
      isMine,
      loadPhoto,
      refreshNearby,
      loadSpot,
      loadVersions,
      addPhoto,
      updatePhoto,
      removePhoto,
      addCapture,
      saveProfile,
      addFriend,
      befriend,
      findByFriendCode,
      searchPeople,
      acceptFriend,
      removeFriend,
      redeemPremiumCode,
      toggleLike,
      fetchLikers,
      reloadNotifications,
      markNotificationsRead,
    ],
  )
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}
