// Stockage local (IndexedDB) : les photos restent sur l'appareil tant
// que le réseau social PICTI (comptes, partage) n'est pas branché.

import type { Capture, GeoPhoto } from './types'

const DB_NAME = 'picti'
const DB_VERSION = 1

export interface StoredImages {
  id: string
  full: Blob
  thumb: Blob
}

type StoreName = 'photos' | 'images' | 'captures'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      db.createObjectStore('photos', { keyPath: 'id' })
      db.createObjectStore('images', { keyPath: 'id' })
      const captures = db.createObjectStore('captures', { keyPath: 'id' })
      captures.createIndex('photoId', 'photoId')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => {
      dbPromise = null
      reject(req.error)
    }
  })
  return dbPromise
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

function result<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb()
  return result(db.transaction(store).objectStore(store).getAll() as IDBRequest<T[]>)
}

export const listPhotos = () => getAll<GeoPhoto>('photos')
export const listCaptures = () => getAll<Capture>('captures')

export async function getImages(id: string): Promise<StoredImages | undefined> {
  const db = await openDb()
  return result(db.transaction('images').objectStore('images').get(id) as IDBRequest<StoredImages | undefined>)
}

export async function putPhoto(photo: GeoPhoto, images?: StoredImages): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(['photos', 'images'], 'readwrite')
  tx.objectStore('photos').put(photo)
  if (images) tx.objectStore('images').put(images)
  return done(tx)
}

export async function deletePhoto(id: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(['photos', 'images', 'captures'], 'readwrite')
  tx.objectStore('photos').delete(id)
  tx.objectStore('images').delete(id)
  const captures = tx.objectStore('captures')
  const keys = captures.index('photoId').getAllKeys(id)
  keys.onsuccess = () => keys.result.forEach((k) => captures.delete(k))
  return done(tx)
}

export async function putCapture(capture: Capture): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('captures', 'readwrite')
  tx.objectStore('captures').put(capture)
  return done(tx)
}
