-- GT / OS — allow owners to delete their own deals
-- Previously only managers/admins could delete. Widen it so a rep can delete a
-- deal they own (same shape as the select/update policies). Managers still
-- delete anything. Deleting a deal cascades to its actions (tasks/notes).
drop policy if exists deals_delete on public.deals;
create policy deals_delete on public.deals for delete to authenticated
  using (public.is_manager() or owner_code = public.current_rep_code());
