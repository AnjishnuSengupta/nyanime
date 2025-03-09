
import mongoose from 'mongoose';
import { Schema, Model } from 'mongoose';
import bcrypt from 'bcryptjs';

// User interface
interface IUser {
  username: string;
  email: string;
  password: string;
  avatar?: string;
  createdAt: Date;
  watchlist: Array<{
    animeId: number;
    addedAt: Date;
  }>;
  history: Array<{
    animeId: number;
    episodeId: number;
    progress: number;
    timestamp: Date;
  }>;
  favorites: Array<{
    animeId: number;
    addedAt: Date;
  }>;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

// User methods interface
interface IUserMethods {
  comparePassword(candidatePassword: string): Promise<boolean>;
}

// User model type
type UserModel = Model<IUser, {}, IUserMethods>;

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
const UserSchema = new Schema<IUser, UserModel, IUserMethods>({
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

// Check if the model already exists to avoid recompiling in hot reload environments
let User: UserModel;

if (mongoose.models.User) {
  User = mongoose.models.User as UserModel;
} else {
  User = mongoose.model<IUser, UserModel>('User', UserSchema);
}

export { connectDB, User };
