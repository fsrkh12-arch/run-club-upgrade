
-- Profile additions
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS weight_kg numeric,
  ADD COLUMN IF NOT EXISTS height_cm numeric,
  ADD COLUMN IF NOT EXISTS dob date;

-- Run additions
ALTER TABLE public.runs
  ADD COLUMN IF NOT EXISTS step_count integer;

-- Side quests
CREATE TABLE IF NOT EXISTS public.side_quests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL DEFAULT CURRENT_DATE,
  slot integer NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  kind text NOT NULL,           -- 'distance' | 'duration' | 'pace' | 'effort' | 'elevation' | 'steps'
  threshold numeric NOT NULL,
  difficulty text NOT NULL DEFAULT 'easy', -- easy | medium | hard | epic
  xp_reward integer NOT NULL DEFAULT 25,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (day, slot)
);
ALTER TABLE public.side_quests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads side quests" ON public.side_quests FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.side_quest_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  quest_id uuid NOT NULL REFERENCES public.side_quests(id) ON DELETE CASCADE,
  run_id uuid,
  xp_awarded integer NOT NULL DEFAULT 0,
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, quest_id)
);
ALTER TABLE public.side_quest_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own completions" ON public.side_quest_completions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own completions" ON public.side_quest_completions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Deterministic seed of 5 quests/day (same for all users). Idempotent.
CREATE OR REPLACE FUNCTION public.seed_daily_quests(_day date DEFAULT CURRENT_DATE)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _seed bigint := abs(hashtext(_day::text));
  _templates jsonb := jsonb_build_array(
    jsonb_build_object('title','Sunrise Sprint','desc','Bank a 3 km run before the day really starts.','kind','distance','threshold',3,'difficulty','easy','xp',40),
    jsonb_build_object('title','Hill Hunter','desc','Climb at least 60 meters of elevation in one run.','kind','elevation','threshold',60,'difficulty','medium','xp',75),
    jsonb_build_object('title','Tempo Trial','desc','Hold a sub-5:30/km pace for at least 4 km.','kind','pace','threshold',330,'difficulty','medium','xp',90),
    jsonb_build_object('title','Long Hauler','desc','Single run of 8 km or more — find your rhythm.','kind','distance','threshold',8,'difficulty','hard','xp',140),
    jsonb_build_object('title','Iron Will','desc','Push effort to 8/10 for 30+ minutes.','kind','duration','threshold',1800,'difficulty','epic','xp',200),
    jsonb_build_object('title','Step Storm','desc','Rack up 10,000 steps in a single run.','kind','steps','threshold',10000,'difficulty','medium','xp',85),
    jsonb_build_object('title','Breakaway','desc','Cover 5 km in under 28 minutes.','kind','duration','threshold',1680,'difficulty','medium','xp',95),
    jsonb_build_object('title','Slow Burn','desc','Easy 2 km recovery — recovery counts too.','kind','distance','threshold',2,'difficulty','easy','xp',30),
    jsonb_build_object('title','Mountain Goat','desc','120 m of elevation gain in one outing.','kind','elevation','threshold',120,'difficulty','hard','xp',160),
    jsonb_build_object('title','Marathoner''s Mind','desc','Single run of 15 km — go far.','kind','distance','threshold',15,'difficulty','epic','xp',260)
  );
  _picked jsonb;
  _i int;
  _idx int;
  _used int[] := ARRAY[]::int[];
BEGIN
  IF EXISTS (SELECT 1 FROM public.side_quests WHERE day = _day) THEN RETURN; END IF;
  FOR _i IN 0..4 LOOP
    _idx := ((_seed >> (_i*3)) % jsonb_array_length(_templates))::int;
    WHILE _idx = ANY(_used) LOOP _idx := (_idx + 1) % jsonb_array_length(_templates); END LOOP;
    _used := _used || _idx;
    _picked := _templates -> _idx;
    INSERT INTO public.side_quests(day, slot, title, description, kind, threshold, difficulty, xp_reward)
    VALUES (_day, _i, _picked->>'title', _picked->>'desc', _picked->>'kind',
            (_picked->>'threshold')::numeric, _picked->>'difficulty', (_picked->>'xp')::int);
  END LOOP;
END $$;

-- Auto-detect quest completion + award XP on new runs
CREATE OR REPLACE FUNCTION public.complete_quests_on_run()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE q RECORD; _ok boolean; _est_steps int;
BEGIN
  PERFORM public.seed_daily_quests(CURRENT_DATE);
  _est_steps := COALESCE(NEW.step_count, ROUND(NEW.distance_km * 1350)::int);
  FOR q IN SELECT * FROM public.side_quests WHERE day = CURRENT_DATE LOOP
    IF EXISTS (SELECT 1 FROM public.side_quest_completions WHERE user_id = NEW.user_id AND quest_id = q.id) THEN
      CONTINUE;
    END IF;
    _ok := CASE q.kind
      WHEN 'distance'  THEN NEW.distance_km >= q.threshold
      WHEN 'duration'  THEN NEW.duration_seconds >= q.threshold
      WHEN 'elevation' THEN NEW.elevation_m >= q.threshold
      WHEN 'effort'    THEN NEW.effort >= q.threshold
      WHEN 'steps'     THEN _est_steps >= q.threshold
      WHEN 'pace'      THEN NEW.distance_km >= 4 AND NEW.avg_pace_seconds > 0 AND NEW.avg_pace_seconds <= q.threshold
      ELSE false
    END;
    IF _ok THEN
      INSERT INTO public.side_quest_completions(user_id, quest_id, run_id, xp_awarded)
      VALUES (NEW.user_id, q.id, NEW.id, q.xp_reward);
      UPDATE public.profiles SET xp = xp + q.xp_reward, updated_at = now() WHERE user_id = NEW.user_id;
      INSERT INTO public.notifications(user_id, type, title, body, data)
      VALUES (NEW.user_id, 'quest', '🏆 Quest cleared: ' || q.title,
        'You banked +' || q.xp_reward || ' XP. Keep the chain alive.',
        jsonb_build_object('quest_id', q.id, 'run_id', NEW.id));
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_complete_quests_on_run ON public.runs;
CREATE TRIGGER trg_complete_quests_on_run AFTER INSERT ON public.runs
FOR EACH ROW EXECUTE FUNCTION public.complete_quests_on_run();

-- Make sure XP/streak/goal triggers actually exist (recreate idempotently)
DROP TRIGGER IF EXISTS trg_award_run_xp ON public.runs;
CREATE TRIGGER trg_award_run_xp AFTER INSERT ON public.runs
FOR EACH ROW EXECUTE FUNCTION public.award_run_xp();

DROP TRIGGER IF EXISTS trg_advance_goals_on_run ON public.runs;
CREATE TRIGGER trg_advance_goals_on_run AFTER INSERT ON public.runs
FOR EACH ROW EXECUTE FUNCTION public.advance_goals_on_run();

DROP TRIGGER IF EXISTS trg_notify_community_message ON public.community_messages;
CREATE TRIGGER trg_notify_community_message AFTER INSERT ON public.community_messages
FOR EACH ROW EXECUTE FUNCTION public.notify_community_message();

DROP TRIGGER IF EXISTS trg_handle_new_user ON auth.users;
-- (auth schema trigger left to existing setup; do not recreate to avoid privilege issues)

-- Streak multiplier in award_run_xp
CREATE OR REPLACE FUNCTION public.award_run_xp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _base int; _bonus int; _xp int; _last date; _new_streak int;
BEGIN
  SELECT last_active_on, streak_days INTO _last, _new_streak FROM public.profiles WHERE user_id = NEW.user_id;
  IF _last IS NULL THEN _new_streak := 1;
  ELSIF _last = CURRENT_DATE THEN _new_streak := COALESCE(_new_streak, 1);
  ELSIF _last = CURRENT_DATE - 1 THEN _new_streak := COALESCE(_new_streak, 0) + 1;
  ELSE _new_streak := 1;
  END IF;
  _base := GREATEST(0, ROUND(NEW.distance_km * 10)::int) + LEAST(NEW.effort, 10);
  _bonus := ROUND(_base * (LEAST(_new_streak, 14) * 0.05))::int;
  _xp := _base + _bonus;
  UPDATE public.profiles SET xp = xp + _xp, last_active_on = CURRENT_DATE, streak_days = _new_streak, updated_at = now() WHERE user_id = NEW.user_id;
  RETURN NEW;
END $$;
