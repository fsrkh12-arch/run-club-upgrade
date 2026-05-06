
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  community_id uuid,
  data jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Owner reads notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Owner updates notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Owner deletes notifications" ON public.notifications FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Authenticated insert notifications" ON public.notifications FOR INSERT WITH CHECK (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, read_at, created_at DESC);

CREATE TABLE IF NOT EXISTS public.trails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  distance_km numeric NOT NULL DEFAULT 0,
  city text,
  polyline jsonb,
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.trails ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Public trails readable" ON public.trails FOR SELECT USING (is_public OR auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Owner inserts trail" ON public.trails FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Owner updates trail" ON public.trails FOR UPDATE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Owner deletes trail" ON public.trails FOR DELETE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DROP TRIGGER IF EXISTS trg_trails_updated ON public.trails;
CREATE TRIGGER trg_trails_updated BEFORE UPDATE ON public.trails FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.community_mutes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  community_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, community_id)
);
ALTER TABLE public.community_mutes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Owner manages mutes select" ON public.community_mutes FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Owner manages mutes insert" ON public.community_mutes FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Owner manages mutes delete" ON public.community_mutes FOR DELETE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.runs
  ADD COLUMN IF NOT EXISTS start_lat numeric,
  ADD COLUMN IF NOT EXISTS start_lng numeric,
  ADD COLUMN IF NOT EXISTS track_points jsonb,
  ADD COLUMN IF NOT EXISTS trail_id uuid;

ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS notified_complete boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.award_run_xp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _xp int; _last date; _new_streak int;
BEGIN
  _xp := GREATEST(0, ROUND(NEW.distance_km * 10)::int) + LEAST(NEW.effort, 10);
  SELECT last_active_on, streak_days INTO _last, _new_streak FROM public.profiles WHERE user_id = NEW.user_id;
  IF _last IS NULL THEN _new_streak := 1;
  ELSIF _last = CURRENT_DATE THEN _new_streak := COALESCE(_new_streak, 1);
  ELSIF _last = CURRENT_DATE - 1 THEN _new_streak := COALESCE(_new_streak, 0) + 1;
  ELSE _new_streak := 1;
  END IF;
  UPDATE public.profiles SET xp = xp + _xp, last_active_on = CURRENT_DATE, streak_days = _new_streak, updated_at = now() WHERE user_id = NEW.user_id;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_award_run_xp ON public.runs;
CREATE TRIGGER trg_award_run_xp AFTER INSERT ON public.runs FOR EACH ROW EXECUTE FUNCTION public.award_run_xp();

CREATE OR REPLACE FUNCTION public.advance_goals_on_run()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g RECORD;
BEGIN
  FOR g IN SELECT * FROM public.goals WHERE user_id = NEW.user_id AND status = 'active' AND notified_complete = false LOOP
    UPDATE public.goals SET current_value = current_value + NEW.distance_km, updated_at = now() WHERE id = g.id;
    IF (g.current_value + NEW.distance_km) >= g.target_value THEN
      UPDATE public.goals SET status = 'complete', notified_complete = true WHERE id = g.id;
      INSERT INTO public.notifications(user_id, type, title, body, data)
      VALUES (NEW.user_id, 'goal', '🎯 Goal smashed: ' || g.title,
        'You hit ' || g.target_value || ' ' || g.unit || '. Push the ceiling — set a bolder target.',
        jsonb_build_object('goal_id', g.id));
    END IF;
  END LOOP;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_advance_goals_on_run ON public.runs;
CREATE TRIGGER trg_advance_goals_on_run AFTER INSERT ON public.runs FOR EACH ROW EXECUTE FUNCTION public.advance_goals_on_run();

CREATE OR REPLACE FUNCTION public.notify_community_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _author text; _cname text;
BEGIN
  SELECT display_name INTO _author FROM public.profiles WHERE user_id = NEW.user_id;
  SELECT name INTO _cname FROM public.communities WHERE id = NEW.community_id;
  INSERT INTO public.notifications(user_id, type, title, body, community_id, data)
  SELECT cm.user_id, 'community_message', _author || ' in ' || _cname, LEFT(NEW.content, 140), NEW.community_id, jsonb_build_object('message_id', NEW.id)
  FROM public.community_members cm
  LEFT JOIN public.community_mutes mu ON mu.user_id = cm.user_id AND mu.community_id = cm.community_id
  LEFT JOIN public.user_settings us ON us.user_id = cm.user_id
  WHERE cm.community_id = NEW.community_id AND cm.user_id <> NEW.user_id AND mu.id IS NULL AND COALESCE(us.notify_messages, true) = true;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_notify_community_message ON public.community_messages;
CREATE TRIGGER trg_notify_community_message AFTER INSERT ON public.community_messages FOR EACH ROW EXECUTE FUNCTION public.notify_community_message();

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.community_messages REPLICA IDENTITY FULL;
