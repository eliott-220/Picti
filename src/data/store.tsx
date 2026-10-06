import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { GeoPoint } from '../geo/geodesy'
import { NEARBY_RADIUS } from '../config'
import { forgetImage, primeImage, registerImagePaths } from './imageUrls'
import { normalizeFriendCode } from './invite'
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
import type { Capture, Friendship, GeoPhoto, PersonResult, Profile, ProfileChanges, Visibility } from './types'

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
      const [prof, mine, caps, hunts, fr] = await Promise.all([
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
    })()
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setReady(true))
    return () => {
      alive = false
    }
  }, [userId, mergePhotos])

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

  const addPhoto = useCallback(
    async (draft: PhotoDraft, images: { full: Blob; thumb: Blob }, chosen?: Visibility) => {
      // Sans choix explicite (pastille du viseur, import) : le réglage du profil, « amis » par défaut.
      const visibility = chosen ?? profile?.defaultVisibility ?? 'amis'
      const { imagePath, thumbPath } = storagePaths(userId, draft.id, images.full.type || 'image/jpeg')
      const bucket = supabase.storage.from(PHOTO_BUCKET)
      const [up1, up2] = await Promise.all([
        bucket.upload(imagePath, images.full, { contentType: images.full.type || 'image/jpeg' }),
        bucket.upload(thumbPath, images.thumb, { contentType: 'image/jpeg' }),
      ])
      try {
        fail(up1.error, 'Envoi de la photo')
        fail(up2.error, 'Envoi de la vignette')
        const photo: GeoPhoto = { ...draft, owner: userId, ownerName: profile?.name ?? '', visibility, imagePath, thumbPath }
        const { data, error: e } = await supabase.from('photos').insert(photoToRow(photo)).select(PHOTO_SELECT).single()
        fail(e, 'Enregistrement de la photo')
        const saved = rowToPhoto(data as unknown as PhotoRow)
        primeImage(imagePath, images.full)
        primeImage(thumbPath, images.thumb)
        mergePhotos([saved])
        return saved
      } catch (err) {
        await bucket.remove([imagePath, thumbPath])
        throw err
      }
    },
    [userId, profile, mergePhotos],
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
    },
    [],
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
      isMine,
      loadPhoto,
      refreshNearby,
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
      isMine,
      loadPhoto,
      refreshNearby,
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
    ],
  )
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}
