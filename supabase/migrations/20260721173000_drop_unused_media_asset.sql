-- migration-safety: destructive-reviewed
-- Drop unused media_asset table. Product images are stored via product.image_path + Supabase Storage.

drop policy if exists "Admins can manage media assets" on public.media_asset;

drop table if exists public.media_asset;
