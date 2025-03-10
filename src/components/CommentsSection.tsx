
import React, { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { toast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { isLoggedIn, getCurrentUserData } from '../services/authService';

interface CommentProps {
  animeId: number;
  comments: {
    id: number;
    user: {
      username: string;
      avatar?: string;
    };
    text: string;
    date: string;
  }[];
  onAddComment?: (text: string) => void;
}

const CommentsSection: React.FC<CommentProps> = ({ animeId, comments, onAddComment }) => {
  const [commentText, setCommentText] = useState('');
  const navigate = useNavigate();
  const loggedIn = isLoggedIn();
  const currentUser = getCurrentUserData();

  const handleCommentSubmit = () => {
    if (!commentText.trim()) {
      toast({
        title: "Error",
        description: "Comment cannot be empty",
        variant: "destructive",
      });
      return;
    }

    if (!loggedIn) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to post a comment",
        variant: "destructive",
      });
      return;
    }

    if (onAddComment) {
      onAddComment(commentText);
    }
    
    toast({
      title: "Success",
      description: "Your comment has been posted",
    });
    
    setCommentText('');
  };

  const handleSignInRedirect = () => {
    toast({
      title: "Authentication Required",
      description: "Redirecting to sign in page",
    });
    navigate('/signin');
  };

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <textarea 
          placeholder={loggedIn ? "Write a comment..." : "Sign in to comment"}
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          className="w-full p-3 rounded-lg bg-anime-gray/50 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-anime-purple min-h-24"
          disabled={!loggedIn}
        />
        <div className="flex justify-between items-center mt-2">
          {!loggedIn && (
            <div className="text-white/60 text-sm">
              You need to sign in to post comments
            </div>
          )}
          <div className="flex gap-2">
            {!loggedIn ? (
              <Button 
                className="bg-anime-purple hover:bg-anime-purple/90"
                onClick={handleSignInRedirect}
              >
                Sign In to Comment
              </Button>
            ) : (
              <Button 
                className="bg-anime-purple hover:bg-anime-purple/90"
                onClick={handleCommentSubmit}
              >
                Post Comment
              </Button>
            )}
          </div>
        </div>
      </div>
      
      <Separator className="my-6 bg-white/10" />
      
      {comments.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-white/60">No comments yet. Be the first to share your thoughts!</p>
        </div>
      ) : (
        <div className="space-y-6">
          {comments.map((comment) => (
            <div key={comment.id} className="flex gap-4">
              <Avatar>
                <AvatarImage src={comment.user.avatar} />
                <AvatarFallback>
                  {comment.user.username.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-white">
                    {comment.user.username}
                  </span>
                  <span className="text-white/50 text-xs">
                    {comment.date}
                  </span>
                </div>
                
                <p className="text-white/80 text-sm">
                  {comment.text}
                </p>
                
                <div className="flex items-center gap-3 mt-2">
                  <button className="text-white/50 text-xs hover:text-white transition-colors">
                    Like
                  </button>
                  <button className="text-white/50 text-xs hover:text-white transition-colors">
                    Reply
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CommentsSection;
