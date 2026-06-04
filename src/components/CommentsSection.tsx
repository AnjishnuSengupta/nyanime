import React, { useState, useEffect, useRef } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Loader2, Heart, Trash2, MessageCircle, LogIn } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser } from '../services/firebaseAuthService';
import {
  subscribeToComments,
  addComment,
  deleteComment,
  toggleLike,
  formatRelativeTime,
  type Comment,
} from '../services/commentService';

interface CommentsSectionProps {
  animeId: number;
}

const CommentsSection: React.FC<CommentsSectionProps> = ({ animeId }) => {
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const uid = currentUser?.uid ?? null;
  const loggedIn = !!uid;

  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [likingId, setLikingId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Real-time Firestore subscription
  useEffect(() => {
    if (!animeId) return;
    setIsLoading(true);
    const unsub = subscribeToComments(animeId, (fetched) => {
      setComments(fetched);
      setIsLoading(false);
    });
    return () => unsub();
  }, [animeId]);

  // Auto-grow textarea
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCommentText(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  const handlePostComment = async () => {
    if (!loggedIn) {
      toast({ title: 'Sign in required', description: 'Please sign in to post a comment.', variant: 'destructive' });
      return;
    }
    const trimmed = commentText.trim();
    if (!trimmed) {
      toast({ title: 'Empty comment', description: 'Write something before posting.', variant: 'destructive' });
      return;
    }
    if (trimmed.length > 2000) {
      toast({ title: 'Too long', description: 'Comments must be under 2000 characters.', variant: 'destructive' });
      return;
    }

    setIsPosting(true);
    try {
      const displayName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Anonymous';
      const avatar = currentUser?.photoURL || undefined;
      await addComment(animeId, uid!, displayName, avatar, trimmed);
      setCommentText('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      toast({ title: 'Posted!', description: 'Your comment has been posted.' });
    } catch (err) {
      console.error('Failed to post comment:', err);
      toast({ title: 'Error', description: 'Failed to post comment. Please try again.', variant: 'destructive' });
    } finally {
      setIsPosting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    setDeletingId(commentId);
    try {
      await deleteComment(animeId, commentId);
      toast({ title: 'Deleted', description: 'Your comment has been removed.' });
    } catch {
      toast({ title: 'Error', description: 'Could not delete comment.', variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  const handleLike = async (comment: Comment) => {
    if (!loggedIn) {
      toast({ title: 'Sign in required', description: 'Sign in to like comments.', variant: 'destructive' });
      return;
    }
    setLikingId(comment.id);
    try {
      const alreadyLiked = comment.likes.includes(uid!);
      await toggleLike(animeId, comment.id, uid!, alreadyLiked);
    } catch {
      toast({ title: 'Error', description: 'Could not update like.', variant: 'destructive' });
    } finally {
      setLikingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Comment input */}
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <Avatar className="h-9 w-9 flex-shrink-0 mt-1">
            {loggedIn && currentUser?.photoURL && <AvatarImage src={currentUser.photoURL} />}
            <AvatarFallback className="bg-anime-purple/20 text-anime-purple text-sm">
              {loggedIn ? (currentUser?.displayName?.[0] ?? '?').toUpperCase() : '?'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <textarea
              ref={textareaRef}
              placeholder={loggedIn ? 'Share your thoughts about this anime…' : 'Sign in to join the discussion'}
              value={commentText}
              onChange={handleTextChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  void handlePostComment();
                }
              }}
              disabled={!loggedIn || isPosting}
              rows={2}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-anime-purple/60 focus:border-anime-purple/60 resize-none transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm min-h-[80px]"
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-white/30 text-xs">
                {loggedIn ? `${commentText.length}/2000 · Ctrl+Enter to post` : ''}
              </span>
              {loggedIn ? (
                <Button
                  onClick={() => void handlePostComment()}
                  disabled={isPosting || !commentText.trim()}
                  className="bg-anime-purple hover:bg-anime-purple/90 text-white text-sm px-5 h-9 rounded-lg transition-all"
                >
                  {isPosting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <MessageCircle className="h-4 w-4 mr-1" />}
                  {isPosting ? 'Posting…' : 'Post'}
                </Button>
              ) : (
                <Button
                  onClick={() => navigate('/signin')}
                  className="bg-anime-purple hover:bg-anime-purple/90 text-white text-sm px-5 h-9 rounded-lg"
                >
                  <LogIn className="h-4 w-4 mr-1" />
                  Sign in to Comment
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <Separator className="bg-white/10" />

      {/* Comments list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-7 w-7 animate-spin text-anime-purple" />
        </div>
      ) : comments.length === 0 ? (
        <div className="text-center py-12">
          <MessageCircle className="h-10 w-10 mx-auto mb-3 text-white/20" />
          <p className="text-white/40 text-sm">No comments yet. Be the first to share your thoughts!</p>
        </div>
      ) : (
        <div className="space-y-5">
          {comments.map((comment) => {
            const isOwn = uid === comment.userId;
            const liked = uid ? comment.likes.includes(uid) : false;
            const likeCount = comment.likes.length;

            return (
              <div key={comment.id} className="flex gap-3 group/comment">
                <Avatar className="h-9 w-9 flex-shrink-0 mt-0.5">
                  {comment.avatar && <AvatarImage src={comment.avatar} />}
                  <AvatarFallback className="bg-anime-purple/20 text-anime-purple text-xs font-semibold">
                    {comment.username.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  {/* Header */}
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-semibold text-white text-sm">{comment.username}</span>
                    {isOwn && (
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-anime-purple/20 text-anime-purple px-1.5 py-0.5 rounded">
                        You
                      </span>
                    )}
                    <span className="text-white/30 text-xs">{formatRelativeTime(comment.createdAt)}</span>
                  </div>

                  {/* Body */}
                  <p className="text-white/80 text-sm leading-relaxed break-words whitespace-pre-wrap">
                    {comment.text}
                  </p>

                  {/* Actions */}
                  <div className="flex items-center gap-3 mt-2">
                    <button
                      onClick={() => void handleLike(comment)}
                      disabled={likingId === comment.id}
                      className={`flex items-center gap-1.5 text-xs transition-colors rounded-full px-2 py-1 hover:bg-white/5
                        ${liked ? 'text-rose-400' : 'text-white/40 hover:text-rose-400'}`}
                    >
                      <Heart
                        className={`h-3.5 w-3.5 transition-all ${liked ? 'fill-rose-400' : ''}`}
                      />
                      <span>{likeCount > 0 ? likeCount : ''}</span>
                    </button>

                    {isOwn && (
                      <button
                        onClick={() => void handleDelete(comment.id)}
                        disabled={deletingId === comment.id}
                        className="flex items-center gap-1 text-xs text-white/30 hover:text-red-400 transition-colors opacity-0 group-hover/comment:opacity-100 rounded-full px-2 py-1 hover:bg-white/5"
                      >
                        {deletingId === comment.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CommentsSection;
