
REVOKE EXECUTE ON FUNCTION public.award_run_xp() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.advance_goals_on_run() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_community_message() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.complete_quests_on_run() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.seed_daily_quests(date) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.seed_daily_quests(date) TO authenticated;
