
import mongoose from 'mongoose';
import { Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

// MongoDB Connection
const connectDB = async () => {
  try {
    const mongoURI = import.meta.env.VITE_MONGODB_URI;
    
    if (!mongoURI) {
      console.error('MongoDB URI is not defined in environment variables');
      return;
    }
    
    await mongoose.connect(mongoURI);
    console.log('MongoDB Connected...');
  } catch (err) {
    console.error('Failed to connect to MongoDB', err);
    // Don't exit in the browser environment
  }
};

// User Schema
const UserSchema = new Schema({
  username: {
    type: String,
    required: true,
    unique: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  avatar: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  watchlist: [
    {
      animeId: Number,
      addedAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  history: [
    {
      animeId: Number,
      episodeId: Number,
      progress: Number,
      timestamp: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  favorites: [
    {
      animeId: Number,
      addedAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
});

// Hash password before saving
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error as Error);
  }
});

// Method to compare password
UserSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw error;
  }
};

// Make sure we don't redefine models in hot reload environments
// Use mongoose.models to check if our model already exists
const User = mongoose.models.User || mongoose.model('User', UserSchema);

export { connectDB, User };
