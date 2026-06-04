/**
 * commentService.ts
 * Firestore-backed comment service.
 * Collection structure: comments/{animeId}/items/{commentId}
 */
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  arrayUnion,
  arrayRemove,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/config/firebase';

export interface Comment {
  id: string;
  userId: string;
  username: string;
  avatar?: string;
  text: string;
  createdAt: Date;
  likes: string[]; // array of userIds who liked
}

/** Firestore raw shape (timestamps arrive as Timestamp objects) */
interface RawComment {
  userId: string;
  username: string;
  avatar?: string;
  text: string;
  createdAt: Timestamp | null;
  likes: string[];
}

function commentsRef(animeId: number) {
  return collection(db, 'comments', String(animeId), 'items');
}

function commentDocRef(animeId: number, commentId: string) {
  return doc(db, 'comments', String(animeId), 'items', commentId);
}

/** Subscribe to live comment updates for an anime. Returns unsubscribe fn. */
export function subscribeToComments(
  animeId: number,
  callback: (comments: Comment[]) => void
): Unsubscribe {
  const q = query(commentsRef(animeId), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const comments: Comment[] = snapshot.docs.map((d) => {
      const data = d.data() as RawComment;
      return {
        id: d.id,
        userId: data.userId,
        username: data.username,
        avatar: data.avatar,
        text: data.text,
        createdAt: data.createdAt ? data.createdAt.toDate() : new Date(),
        likes: data.likes || [],
      };
    });
    callback(comments);
  });
}

/** Post a new comment */
export async function addComment(
  animeId: number,
  userId: string,
  username: string,
  avatar: string | undefined,
  text: string
): Promise<void> {
  await addDoc(commentsRef(animeId), {
    userId,
    username,
    avatar: avatar || null,
    text: text.trim(),
    createdAt: serverTimestamp(),
    likes: [],
  });
}

/** Delete own comment */
export async function deleteComment(animeId: number, commentId: string): Promise<void> {
  await deleteDoc(commentDocRef(animeId, commentId));
}

/** Toggle like on a comment */
export async function toggleLike(
  animeId: number,
  commentId: string,
  userId: string,
  currentlyLiked: boolean
): Promise<void> {
  const ref = commentDocRef(animeId, commentId);
  await updateDoc(ref, {
    likes: currentlyLiked ? arrayRemove(userId) : arrayUnion(userId),
  });
}

/** Format a Date relative to now (e.g. "2 hours ago") */
export function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
