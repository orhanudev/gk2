import { useState, useEffect } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item) {
        const parsed = JSON.parse(item);
        // Convert watchedVideos arrays back to Sets for playlists
        if (Array.isArray(parsed)) {
          return parsed.map((playlist: any) => ({
            ...playlist,
            name: typeof playlist.name === 'string' ? playlist.name : 'Unnamed Playlist',
            videos: Array.isArray(playlist.videos) ? playlist.videos : [],
            watchedVideos: new Set(playlist.watchedVideos || []),
            currentVideoIndex: playlist.currentVideoIndex || 0,
            videoPositions: new Map(playlist.videoPositions || [])
          }));
        }
        // Handle single playlist object
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return {
            ...parsed,
            name: typeof parsed.name === 'string' ? parsed.name : 'Unnamed Playlist',
            videos: Array.isArray(parsed.videos) ? parsed.videos : [],
            videoPositions: new Map(parsed.videoPositions || [])
          };
        }
        return parsed;
      }
      return initialValue;
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      
      // Convert Sets to arrays for JSON serialization
      let serializable = valueToStore;
      if (Array.isArray(valueToStore)) {
        serializable = valueToStore.map((playlist: any) => ({
          ...playlist,
          watchedVideos: Array.from(playlist.watchedVideos || []),
          videoPositions: Array.from(playlist.videoPositions || [])
        }));
      }
      
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(serializable));
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  };

  return [storedValue, setValue] as const;
}