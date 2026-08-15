# Exercise media

Exercise metadata remains in the existing dataset. Approved animation metadata is registered in `exercise-media.json` by stable exercise ID; GIF binaries are not stored in this repository or persisted to local disk at runtime.

Every enabled manifest entry must provide:

- `exercise_id`: ID from the exercises dataset
- `remote_url`: exact approved HTTPS URL for the GIF binary
- `media_type`: currently `image/gif`
- `source` and `source_url`
- `license` and `license_url`
- `attribution`: text displayed to the Telegram user
- `sha256`: lowercase SHA-256 of the exact approved bytes
- `enabled`: `true` to make the animation available

The approved Wikimedia works are documented in [ATTRIBUTIONS.md](./ATTRIBUTIONS.md). Their licenses apply to the media works, not to the rest of the application.

At startup, the manifest is validated after the exercise dataset is imported. Unknown exercise IDs, unsupported media types, invalid URLs, or malformed hashes stop startup instead of serving unapproved media. An exercise without an approved entry falls back to the normal text conversation flow.

On first use, the bot fetches the exact `remote_url` into memory, rejects redirects and unapproved hosts, enforces the size limit, and verifies the GIF content type, signature, and SHA-256 before uploading it to Telegram. Only Telegram's bot-specific `file_id` is cached in the database. Later requests reuse that ID without downloading the GIF again. If delivery fails, the user receives the source page URL.

Runtime controls:

- `EXERCISE_MEDIA_ALLOWED_HOSTS`: comma-separated host allowlist; defaults to `upload.wikimedia.org`
- `EXERCISE_MEDIA_MAX_BYTES`: maximum in-memory GIF size; defaults to 10 MiB

Example:

```json
{
  "exercise_id": "0025",
  "remote_url": "https://upload.wikimedia.org/path/bench-press.gif",
  "media_type": "image/gif",
  "source": "Wikimedia Commons",
  "source_url": "https://commons.wikimedia.org/wiki/File:Bench_press.gif",
  "license": "CC BY-SA 4.0",
  "license_url": "https://creativecommons.org/licenses/by-sa/4.0/",
  "attribution": "Creator / Wikimedia Commons",
  "sha256": "64-character lowercase SHA-256",
  "enabled": true
}
```

Enabled animations are general visual references, not personalized or authoritative movement-form assessments. The Telegram response states that distinction and includes source and license details.
