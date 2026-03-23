-- Business info: one row per user (avatar/logo + branding details)
CREATE TABLE IF NOT EXISTS public.business_info (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name text,
  logo_url    text,       -- public URL returned by storage
  logo_path   text,       -- storage object path for cleanup on replace
  website     text,
  description text,
  phone       text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.business_info ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own business info"
  ON public.business_info FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own business info"
  ON public.business_info FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own business info"
  ON public.business_info FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own business info"
  ON public.business_info FOR DELETE
  USING (auth.uid() = user_id);

-- Storage bucket for business logos (one logo per user)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'business-logos',
  'business-logos',
  true,
  5242880, -- 5 MB
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- RLS for storage: users can only manage their own folder
CREATE POLICY "Users upload own logo"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'business-logos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users update own logo"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'business-logos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own logo"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'business-logos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Anyone can read business logos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'business-logos');
