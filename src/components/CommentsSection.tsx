import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Loader2,
  Heart,
  Trash2,
  MessageCircle,
  LogIn,
  CornerDownRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser } from '../services/firebaseAuthService';
import {
  subscribeToComments,
  subscribeToReplies,
  addComment,
  addReply,
  deleteComment,
  toggleLike,
  formatRelativeTime,
  type Comment,
} from '../services/commentService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CommentsSectionProps {
  animeId: number;
}

type CurrentUser = ReturnType<typeof getCurrentUser>;

// ─── CommentRow ───────────────────────────────────────────────────────────────
// Used for both top-level comments and replies (isReply = true)

interface CommentRowProps {
  comment: Comment;
  animeId: number;
  uid: string | null;
  loggedIn: boolean;
  isReply?: boolean;
  currentUser: CurrentUser;
}

const CommentRow: React.FC<CommentRowProps> = ({
  comment,
  animeId,
  uid,
  loggedIn,
  isReply = false,
  currentUser,
}) => {
  const [replies, setReplies] = useState<Comment[]>([]);
  const [showReplies, setShowReplies] = useState(false);
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isPostingReply, setIsPostingReply] = useState(false);
  const replyRef = useRef<HTMLTextAreaElement>(null);

  const isOwn = uid === comment.userId;
  const liked = uid ? comment.likes.includes(uid) : false;
  const likeCount = comment.likes.length;

  // Subscribe to replies only when the user expands them (lazy)
  useEffect(() => {
    if (!showReplies || isReply) return;
    const unsub = subscribeToReplies(animeId, comment.id, setReplies);
    return () => unsub();
  }, [showReplies, animeId, comment.id, isReply]);

  const handleLike = useCallback(async () => {
    if (!loggedIn || !uid) {
      toast({ title: 'Sign in required', description: 'Sign in to like comments.', variant: 'destructive' });
      return;
    }
    try {
      await toggleLike(animeId, comment.id, uid, liked);
    } catch {
      toast({ title: 'Error', description: 'Could not update like.', variant: 'destructive' });
    }
  }, [animeId, comment.id, uid, liked, loggedIn]);

  const handleDelete = useCallback(async () => {
    try {
      await deleteComment(animeId, comment.id);
      toast({ title: 'Deleted', description: 'Your comment has been removed.' });
    } catch {
      toast({ title: 'Error', description: 'Could not delete comment.', variant: 'destructive' });
    }
  }, [animeId, comment.id]);

  const handlePostReply = useCallback(async () => {
    if (!loggedIn || !uid) return;
    const trimmed = replyText.trim();
    if (!trimmed) return;
    if (trimmed.length > 2000) {
      toast({ title: 'Too long', description: 'Replies must be under 2000 characters.', variant: 'destructive' });
      return;
    }
    setIsPostingReply(true);
    try {
      const displayName = currentUser?.username || currentUser?.email?.split('@')[0] || 'Anonymous';
      const avatar = currentUser?.avatar || undefined;
      await addReply(animeId, comment.id, uid, displayName, avatar, trimmed);
      setReplyText('');
      setShowReplyInput(false);
      setShowReplies(true);
      toast({ title: 'Reply posted!' });
    } catch (err) {
      console.error('Failed to post reply:', err);
      toast({ title: 'Error', description: 'Failed to post reply.', variant: 'destructive' });
    } finally {
      setIsPostingReply(false);
    }
  }, [animeId, comment.id, uid, replyText, loggedIn, currentUser]);

  return (
    <div className={`flex gap-3 group/comment ${isReply ? 'ml-10' : ''}`}>
      {/* Avatar */}
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
          {isReply && (
            <span className="text-[10px] font-medium text-anime-purple/60 bg-anime-purple/10 px-1.5 py-0.5 rounded">
              Reply
            </span>
          )}
          <span className="text-white/30 text-xs">{formatRelativeTime(comment.createdAt)}</span>
        </div>

        {/* Body */}
        <p className="text-white/80 text-sm leading-relaxed break-words whitespace-pre-wrap">
          {comment.text}
        </p>

        {/* Action bar */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {/* Like */}
          <button
            onClick={() => void handleLike()}
            className={`flex items-center gap-1.5 text-xs transition-colors rounded-full px-2 py-1 hover:bg-white/5 ${
              liked ? 'text-rose-400' : 'text-white/40 hover:text-rose-400'
            }`}
          >
            <Heart className={`h-3.5 w-3.5 transition-all ${liked ? 'fill-rose-400' : ''}`} />
            <span>{likeCount > 0 ? likeCount : ''}</span>
          </button>

          {/* Reply — only for top-level comments, only when logged in */}
          {!isReply && loggedIn && (
            <button
              onClick={() => setShowReplyInput((v) => !v)}
              className="flex items-center gap-1 text-xs text-white/40 hover:text-anime-purple transition-colors rounded-full px-2 py-1 hover:bg-white/5"
            >
              <CornerDownRight className="h-3 w-3" />
              Reply
            </button>
          )}

          {/* Delete (own comments only) */}
          {isOwn && (
            <button
              onClick={() => void handleDelete()}
              className="flex items-center gap-1 text-xs text-white/30 hover:text-red-400 transition-colors opacity-0 group-hover/comment:opacity-100 rounded-full px-2 py-1 hover:bg-white/5"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Inline reply input */}
        {showReplyInput && (
          <div className="mt-3 flex gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
            <textarea
              ref={replyRef}
              placeholder={`Reply to ${comment.username}…`}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void handlePostReply();
              }}
              rows={2}
              className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-anime-purple/60 focus:border-anime-purple/60 resize-none text-sm"
            />
            <div className="flex flex-col gap-1.5">
              <Button
                size="sm"
                className="h-8 px-3 bg-anime-purple hover:bg-anime-purple/90 text-white text-xs"
                onClick={() => void handlePostReply()}
                disabled={isPostingReply || !replyText.trim()}
              >
                {isPostingReply ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Post'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-3 text-white/40 hover:text-white text-xs"
                onClick={() => {
                  setShowReplyInput(false);
                  setReplyText('');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Show/hide replies toggle + list (top-level only) */}
        {!isReply && (
          <div>
            {replies.length > 0 && (
              <button
                onClick={() => setShowReplies((v) => !v)}
                className="flex items-center gap-1 mt-2 text-xs text-anime-purple/80 hover:text-anime-purple transition-colors"
              >
                {showReplies ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {showReplies ? 'Hide' : `${replies.length}`}{' '}
                {replies.length === 1 ? 'reply' : 'replies'}
              </button>
            )}

            {showReplies && (
              <div className="mt-3 space-y-4 border-l border-white/10 pl-3">
                {replies.map((reply) => (
                  <CommentRow
                    key={reply.id}
                    comment={reply}
                    animeId={animeId}
                    uid={uid}
                    loggedIn={loggedIn}
                    isReply={true}
                    currentUser={currentUser}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── CommentsSection ──────────────────────────────────────────────────────────

const CommentsSection: React.FC<CommentsSectionProps> = ({ animeId }) => {
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const uid = currentUser?.id ?? null;
  const loggedIn = !!uid;

  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Real-time subscription to top-level comments only
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
    if (!uid) return;

    setIsPosting(true);
    try {
      const displayName = currentUser?.username || currentUser?.email?.split('@')[0] || 'Anonymous';
      const avatar = currentUser?.avatar || undefined;
      await addComment(animeId, uid, displayName, avatar, trimmed);
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

  return (
    <div className="space-y-6">
      {/* Comment input */}
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <Avatar className="h-9 w-9 flex-shrink-0 mt-1">
            {loggedIn && currentUser?.avatar && <AvatarImage src={currentUser.avatar} />}
            <AvatarFallback className="bg-anime-purple/20 text-anime-purple text-sm">
              {loggedIn ? (currentUser?.username?.[0] ?? '?').toUpperCase() : '?'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <textarea
              ref={textareaRef}
              placeholder={
                loggedIn ? 'Share your thoughts about this anime…' : 'Sign in to join the discussion'
              }
              value={commentText}
              onChange={handleTextChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void handlePostComment();
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
                  {isPosting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <MessageCircle className="h-4 w-4 mr-1" />
                  )}
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
          {comments.map((comment) => (
            <CommentRow
              key={comment.id}
              comment={comment}
              animeId={animeId}
              uid={uid}
              loggedIn={loggedIn}
              currentUser={currentUser}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default CommentsSection;
