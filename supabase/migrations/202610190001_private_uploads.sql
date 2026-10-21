INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('crm-uploads', 'crm-uploads', false, 26214400)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 26214400;
-- No anon/authenticated storage policies: FastAPI checks CRM grants before
-- creating short-lived signed URLs. The service key never goes to the browser.
