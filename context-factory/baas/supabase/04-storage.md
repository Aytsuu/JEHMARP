# Supabase — Storage
<!-- agent-doc: v0.1.2 | last-updated: 2026-06 | audience: LLM agents, senior engineers -->

## This Project's Usage

- One storage bucket for file uploads per project.
- Files are uploaded directly from the browser using a **signed upload URL** issued by the API.
- The API issues the URL via `GET /api/v1/projects/{project_id}/files/upload-url`.
- After upload, the API persists a record to `uploaded_file`.

## Upload Flow

```
1. Frontend requests a signed URL: GET /files/upload-url
2. API calls supabase.storage.createSignedUploadUrl(...)
3. Frontend uploads directly to Supabase Storage using the signed URL (no credentials in browser)
4. Frontend calls API to persist the file record to uploaded_file table
```

## Access Control Rules

Storage upsert requires **INSERT + SELECT + UPDATE**. Granting only INSERT allows new uploads but silently fails on replacement.

```sql
-- Bucket policy: members of a project can upload to their project folder
create policy "Project members can upload"
on storage.objects for insert
with check (
  bucket_id = 'uploads'
  -- path structure: {project_id}/{filename}
  and split_part(name, '/', 1)::uuid in (
    select project_id from project_member
    where session_id = current_setting('request.headers', true)::json->>'x-session-id'
  )
);
```

## Python SDK (ai_engine — reading files)

```python
# Download a file for processing
response = supabase.storage.from_("uploads").download(storage_path)
content = response  # bytes
```

## Phase 3 Note

File content indexing (OCR, transcription) is deferred to Phase 5/stretch. In Phase 3, only filename + mime type are included in agent context.
