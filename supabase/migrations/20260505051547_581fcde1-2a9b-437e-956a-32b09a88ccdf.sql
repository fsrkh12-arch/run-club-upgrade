
-- Add XP fields to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS xp integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streak_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_active_on date;

-- Communities
CREATE TABLE public.communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  emoji text NOT NULL DEFAULT '🏃',
  city text,
  is_official boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Communities readable" ON public.communities FOR SELECT USING (true);
CREATE POLICY "Authenticated can create communities" ON public.communities FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE TABLE public.community_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(community_id, user_id)
);
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Memberships readable" ON public.community_members FOR SELECT USING (true);
CREATE POLICY "Join self" ON public.community_members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Leave self" ON public.community_members FOR DELETE USING (auth.uid() = user_id);

-- Helper to check membership without recursion
CREATE OR REPLACE FUNCTION public.is_community_member(_community_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.community_members WHERE community_id = _community_id AND user_id = _user_id)
$$;

CREATE TABLE public.community_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.community_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read messages" ON public.community_messages FOR SELECT
  USING (public.is_community_member(community_id, auth.uid()));
CREATE POLICY "Members send messages" ON public.community_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id AND public.is_community_member(community_id, auth.uid()));
CREATE POLICY "Authors delete own messages" ON public.community_messages FOR DELETE USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.community_messages;

-- Daily check-ins for XP
CREATE TABLE public.daily_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  checkin_on date NOT NULL DEFAULT CURRENT_DATE,
  xp_awarded integer NOT NULL DEFAULT 10,
  UNIQUE(user_id, checkin_on)
);
ALTER TABLE public.daily_checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own checkins" ON public.daily_checkins FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own checkins" ON public.daily_checkins FOR INSERT WITH CHECK (auth.uid() = user_id);

-- User settings
CREATE TABLE public.user_settings (
  user_id uuid PRIMARY KEY,
  units text NOT NULL DEFAULT 'metric',
  theme text NOT NULL DEFAULT 'system',
  accent text NOT NULL DEFAULT 'mint',
  default_run_visibility text NOT NULL DEFAULT 'private',
  profile_visibility text NOT NULL DEFAULT 'public',
  show_on_leaderboard boolean NOT NULL DEFAULT true,
  notify_messages boolean NOT NULL DEFAULT true,
  notify_challenges boolean NOT NULL DEFAULT true,
  notify_weekly_summary boolean NOT NULL DEFAULT true,
  weekly_km_goal numeric NOT NULL DEFAULT 30,
  preferred_run_days text[] NOT NULL DEFAULT ARRAY['mon','wed','fri','sun'],
  language text NOT NULL DEFAULT 'en',
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads settings" ON public.user_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Owner upserts settings" ON public.user_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner updates settings" ON public.user_settings FOR UPDATE USING (auth.uid() = user_id);

-- Auto-create profile + settings on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _name text;
  _initials text;
BEGIN
  _name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1), 'Runner');
  _initials := UPPER(LEFT(_name,2));
  INSERT INTO public.profiles (user_id, display_name, avatar_initials)
  VALUES (NEW.id, _name, _initials)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.user_settings (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Award XP on run insert
CREATE OR REPLACE FUNCTION public.award_run_xp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _xp integer;
BEGIN
  _xp := GREATEST(0, ROUND(NEW.distance_km * 10)::int) + LEAST(NEW.effort,10);
  UPDATE public.profiles
    SET xp = xp + _xp,
        last_active_on = CURRENT_DATE,
        updated_at = now()
    WHERE user_id = NEW.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_run_insert_award_xp ON public.runs;
CREATE TRIGGER on_run_insert_award_xp
  AFTER INSERT ON public.runs
  FOR EACH ROW EXECUTE FUNCTION public.award_run_xp();

-- Seed a few starter communities
INSERT INTO public.communities (slug, name, description, emoji, city, is_official) VALUES
  ('baku-dawn-patrol', 'Baku Dawn Patrol', 'Sunrise runs along the Caspian boulevard.', '🌅', 'Baku', true),
  ('trail-collective', 'Trail Collective', 'Off-road, hills and adventure runs.', '🏔️', null, true),
  ('marathon-makers', 'Marathon Makers', 'Training plans and long-run support.', '🥇', null, true),
  ('5k-starters', '5K Starters', 'Beginner-friendly couch-to-5K crew.', '🌱', null, true),
  ('night-owls', 'Night Owls', 'Late-night runners welcome.', '🌙', null, true)
ON CONFLICT (slug) DO NOTHING;
