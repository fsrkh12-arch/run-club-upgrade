CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT 'Runner',
  handle TEXT UNIQUE,
  avatar_initials TEXT NOT NULL DEFAULT 'RC',
  city TEXT NOT NULL DEFAULT 'Baku',
  weekly_km_goal NUMERIC NOT NULL DEFAULT 30,
  runner_level TEXT NOT NULL DEFAULT 'building',
  bio TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  route_name TEXT NOT NULL,
  distance_km NUMERIC NOT NULL DEFAULT 0,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  avg_pace_seconds INTEGER NOT NULL DEFAULT 0,
  avg_heart_rate INTEGER,
  elevation_m INTEGER NOT NULL DEFAULT 0,
  effort INTEGER NOT NULL DEFAULT 5,
  cadence INTEGER,
  calories INTEGER,
  shoe TEXT,
  weather TEXT,
  notes TEXT,
  visibility TEXT NOT NULL DEFAULT 'private',
  run_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  metric TEXT NOT NULL DEFAULT 'distance',
  target_value NUMERIC NOT NULL DEFAULT 0,
  current_value NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'km',
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.community_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'update',
  route_name TEXT,
  distance_km NUMERIC,
  pace_seconds INTEGER,
  visibility TEXT NOT NULL DEFAULT 'public',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.post_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id)
);

ALTER TABLE public.post_reactions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.challenges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  target_km NUMERIC NOT NULL DEFAULT 0,
  starts_on DATE NOT NULL DEFAULT CURRENT_DATE,
  ends_on DATE NOT NULL DEFAULT CURRENT_DATE + 30,
  badge_label TEXT NOT NULL DEFAULT 'Finisher',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.challenge_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  challenge_id UUID NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  progress_km NUMERIC NOT NULL DEFAULT 0,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(challenge_id, user_id)
);

ALTER TABLE public.challenge_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_runs_updated_at
BEFORE UPDATE ON public.runs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_goals_updated_at
BEFORE UPDATE ON public.goals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_community_posts_updated_at
BEFORE UPDATE ON public.community_posts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_challenges_updated_at
BEFORE UPDATE ON public.challenges
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Profile summaries are readable"
ON public.profiles
FOR SELECT
USING (true);

CREATE POLICY "Members create their own profile"
ON public.profiles
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Members update their own profile"
ON public.profiles
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Members view own runs or shared runs"
ON public.runs
FOR SELECT
USING (auth.uid() = user_id OR visibility = 'public');

CREATE POLICY "Members create own runs"
ON public.runs
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Members update own runs"
ON public.runs
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Members delete own runs"
ON public.runs
FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Members view own goals"
ON public.goals
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Members create own goals"
ON public.goals
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Members update own goals"
ON public.goals
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Members delete own goals"
ON public.goals
FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Community posts are readable"
ON public.community_posts
FOR SELECT
USING (visibility = 'public' OR auth.uid() = user_id);

CREATE POLICY "Members create own posts"
ON public.community_posts
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Members update own posts"
ON public.community_posts
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Members delete own posts"
ON public.community_posts
FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Post reactions are readable"
ON public.post_reactions
FOR SELECT
USING (true);

CREATE POLICY "Members create own reactions"
ON public.post_reactions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Members delete own reactions"
ON public.post_reactions
FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Challenges are readable"
ON public.challenges
FOR SELECT
USING (true);

CREATE POLICY "Challenge progress is readable"
ON public.challenge_members
FOR SELECT
USING (true);

CREATE POLICY "Members join challenges as themselves"
ON public.challenge_members
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Members update own challenge progress"
ON public.challenge_members
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Members leave own challenge entries"
ON public.challenge_members
FOR DELETE
USING (auth.uid() = user_id);

CREATE INDEX idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX idx_runs_user_id_run_at ON public.runs(user_id, run_at DESC);
CREATE INDEX idx_runs_visibility ON public.runs(visibility);
CREATE INDEX idx_goals_user_id ON public.goals(user_id);
CREATE INDEX idx_posts_created_at ON public.community_posts(created_at DESC);
CREATE INDEX idx_post_reactions_post_id ON public.post_reactions(post_id);
CREATE INDEX idx_challenge_members_challenge_id ON public.challenge_members(challenge_id);