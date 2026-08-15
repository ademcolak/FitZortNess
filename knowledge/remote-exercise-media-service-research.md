# Remote exercise media service research

Date: 2026-07-16

## Decision

FitZortNess can fetch approved exercise media on demand instead of committing roughly 1,000 binary files to Git. It should **not** search the public web or an open-media API inside the user request path and immediately send the first result.

The recommended design is:

1. search Wikimedia Commons, Openverse and optionally wger in a background discovery job;
2. store candidates against a stable FitZortNess exercise ID;
3. require a human to approve the exact exercise/equipment variant, movement quality and rights metadata;
4. on first use, fetch the already approved URL through the bot backend, validate the bytes and upload them to Telegram;
5. save Telegram's returned `file_id` and use it for later sends;
6. retain the existing text answer as the failure path.

This removes repository bloat and repeated downloads, but it does **not** remove attribution, license, ShareAlike, personality-rights or source-verification obligations. Wikimedia explicitly says hotlinking still requires the same license compliance as hosting a copy, and recommends downloading for reuse rather than hotlinking.[^commons-technical]

## Service capabilities

| Source | Runtime search | File and rights metadata | Authentication and limits | Fit for Telegram | Decision |
| --- | --- | --- | --- | --- | --- |
| Wikimedia Commons Action API | Yes. `generator=search`/`list=search`, restricted to file namespace `6`, can search titles and description text; CirrusSearch supports the `filemime:"image/gif"` filter.[^mediawiki-search][^cirrus-file-search] | `prop=imageinfo&iiprop=url|mime|size|sha1|extmetadata` returns the original/description URLs, MIME, dimensions, size, Wikimedia SHA-1 and formatted metadata. `extmetadata` can include artist, credit, license name/URL and attribution requirement.[^mediawiki-imageinfo] | Public read requests do not require an API key. Wikimedia's 2026 limits are 10 requests/minute for unidentified traffic, 200/minute for a compliant User-Agent or new authenticated user and 2,000/minute for an established authenticated editor; the limits are explicitly experimental. Clients should use at most three concurrent requests, cache, batch, identify themselves and honor `Retry-After`.[^wikimedia-rate-limits] | GIF URLs can be fetched by the backend or passed to Telegram. Backend fetch is preferable because it allows hash, size and MIME validation before upload. | Primary source for approved Commons candidates. Do discovery offline, not per chat message. |
| Openverse API | Yes. `/v1/images/` supports `q`, `source`, `license`, `license_type`, `extension`, creator/title/tag and other filters. A suitable discovery query can use `extension=gif&license_type=commercial`.[^openverse-api] | Search/detail results expose the media URL, original landing page, creator and creator URL, license/version/URL, provider/source, attribution, type, size, dimensions and tags.[^openverse-api] | Anonymous use is allowed. Registration plus OAuth2 client credentials gives a slightly higher tier; higher access is discretionary. Rate-limit headers are returned and `429` is the over-limit response. On 2026-07-16 an anonymous response advertised `20/min` burst and `200/day` sustained, but these response-header values are operational settings, not a permanent contract.[^openverse-api] | It can discover GIF URLs, but usually points to another provider. Every provider URL and landing page still needs verification and safe-fetch controls. | Use as a candidate-discovery index, not as the legal source of truth or a live automatic selector. |
| wger public API | Yes for public exercise/media catalog endpoints; public exercise data can be read without authentication.[^wger-api] | Exercise image/video objects expose media URLs, exercise IDs, license IDs and per-item author/source fields. wger documents its initial exercise/ingredient content as CC BY-SA 3.0 and notes that some images have separate Wikipedia sources.[^wger-license] | Public catalog reads require no authentication. No stable public rate commitment was found; cache and batch conservatively. | Current media is mostly still images or video rather than GIF. Video must be H.264 MP4 without sound to qualify as Telegram animation without conversion. | Useful supplementary exercise-specific source, not a replacement for 1,000 exact animations. |

### Wikimedia query shape

A single Commons request can combine discovery and metadata retrieval:

```text
GET https://commons.wikimedia.org/w/api.php
  ?action=query
  &format=json
  &formatversion=2
  &generator=search
  &gsrsearch=pushup filemime:"image/gif"
  &gsrnamespace=6
  &gsrlimit=10
  &prop=imageinfo
  &iiprop=url|mime|size|sha1|extmetadata
  &iiextmetadatafilter=Artist|Credit|LicenseShortName|LicenseUrl|AttributionRequired|UsageTerms|ImageDescription
```

`extmetadata` is documented as an expensive property and should be requested only for a small candidate set.[^mediawiki-imageinfo] Its fields are HTML-formatted, so they must be sanitized before display or persisted as normalized plain-text fields.

### Openverse query shape

```text
GET https://api.openverse.org/v1/images/
  ?q=pushup
  &extension=gif
  &license_type=commercial
  &page_size=10
```

Openverse is an index of openly licensed media, not a warranty. Its Terms prohibit scraping and make the caller responsible for independently verifying the right to use each work and the applicable conditions.[^openverse-terms] An application using the API must also identify itself as made using Openverse but not endorsed or certified by Openverse.[^openverse-terms]

## Coverage reality

Connecting to an API solves storage and delivery; it does not create 1,000 legally and biomechanically correct one-to-one matches.

A small live Openverse sample on 2026-07-16, using `extension=gif&license_type=commercial`, returned:

- `pushup`: 3 results;
- `barbell bench press`: 0 results;
- `deadlift`: 3 results, including side-deadlift variants that are not an exact barbell-deadlift match;
- `burpee`: 4 results.

These counts will change as Openverse reindexes sources. More importantly, even a relevant title is not proof that the depicted equipment, stance, range of motion or movement quality matches the FitZortNess record.

The official wger API snapshot on the same date reported [360 exercise images](https://wger.de/api/v2/exerciseimage/?limit=1) and [78 videos](https://wger.de/api/v2/video/?limit=100). Those 78 videos covered 46 unique external exercise IDs; 54 were HEVC and 24 H.264. Only 60 were under Telegram's 50 MB upload ceiling before considering container/audio compatibility. Therefore wger is a useful supplement, but does not provide GIF coverage for this dataset.

The existing dataset's roughly 1,000 remote GIF URLs cannot be treated as reusable merely because they are reachable. Their upstream terms or a separate provider agreement must explicitly permit the intended use. If exact full-catalog coverage is required, realistic routes are:

- obtain a commercial redistribution/API license from the existing provider;
- commission or create a first-party animation set with documented contributor/model releases;
- curate open media progressively and accept that unmatched exercises use text only.

## Telegram delivery

Telegram's `sendAnimation` accepts a GIF or silent H.264/MPEG-4 animation. The Bot API supports three delivery modes: an existing Telegram `file_id` (recommended), a public HTTP URL, or multipart upload. The documented current ceiling is 50 MB for an uploaded animation; URL-based sending falls under the general remote-fetch ceiling of 20 MB for non-photo content.[^telegram-api]

For FitZortNess:

- do not send provider URLs directly on first use, because Telegram would fetch bytes that the bot did not hash or inspect;
- fetch approved media in the backend, enforce a smaller product limit such as 10 MB, validate and upload it;
- store the returned `file_id` beside the approved media version/hash and reuse it;
- keep the approved source URL or an object-storage copy because Telegram states that `file_id` is bot-specific and cannot be transferred to another bot.[^telegram-api]

Attribution should be sent in the animation caption or an adjacent message every time the work is presented. Telegram caching does not change the reuse obligations.

## Recommended scalable architecture

### 1. Offline discovery index

Run a rate-limited background command, never a user-facing request, over exercise aliases such as English canonical name, equipment-qualified name and carefully maintained synonyms.

For each exercise ID:

- query Openverse for a broad candidate list;
- prefer `source=wikimedia` when Commons metadata can be rechecked directly;
- query Commons directly for additional file-namespace results;
- optionally query wger for exercise-specific still/video candidates;
- normalize candidates into a table without enabling them.

Suggested candidate fields:

```text
exercise_id
provider
provider_media_id
provider_revision_or_timestamp
media_url
landing_url
mime_type
byte_size
upstream_sha1
creator
creator_url
license_spdx_or_normalized_name
license_version
license_url
attribution
modification_status
personality_rights_status
biomechanics_review_status
status = candidate | approved | rejected | stale
reviewed_by
reviewed_at
```

Keep the existing manifest/approved-media boundary, but let an approved entry identify a remote source in addition to a local file. The LLM must never invent or approve a URL.

### 2. Human approval gate

Approval must confirm all of the following:

- exact exercise, equipment and variation match;
- media visibly demonstrates acceptable form for its intended role;
- creator, landing page, license name/version and license URL are present;
- license permits commercial use if portfolio use might later become commercial;
- required attribution and change notice are known;
- identifiable-person/model-release and privacy risks are assessed separately from copyright;
- the file is not merely tagged “free” without a recognized license.

Wikimedia itself warns that it does not warrant the correctness of file licensing and that personality, moral, privacy, trademark and other rights may apply independently.[^commons-reuse]

### 3. First-use fetch and cache

On an exercise-form request:

1. resolve only an `approved` media record by `exercise_id`;
2. if its Telegram `file_id` is present for the current bot and approved content version, send that;
3. otherwise fetch the pinned URL server-side with a short timeout and strict maximum bytes;
4. allow only HTTPS and approved provider/host pairs; reject private/reserved IP destinations and redirects outside the allowlist;
5. verify final host, HTTP status, `Content-Type`, magic bytes, dimensions/frame count/duration and size;
6. compare the approved upstream revision/hash and compute FitZortNess SHA-256 over the exact bytes;
7. upload those same validated bytes to Telegram;
8. persist the returned bot-specific `file_id`, final SHA-256 and fetch timestamp;
9. send attribution and the existing general-visual-reference notice.

An optional object-storage cache is useful if the Telegram bot changes or Telegram invalidates a cached identifier. Object storage must keep each media object's license/attribution metadata and access controls together with the binary.

### 4. Revalidation

Run a periodic background check, for example weekly:

- re-read the Commons file page/API revision, license metadata and SHA-1;
- check that Openverse/provider landing and media URLs still resolve;
- if content bytes, license, authorship, source page or rights warnings change, mark the mapping `stale` and stop serving it until reviewed;
- never silently accept changed bytes and calculate a new approved hash;
- retain the dated metadata snapshot on which each approval was based.

Wikimedia allows hotlinking but warns that files can be changed, vandalized, renamed or deleted, and says it generally does not allow “hot spider” services that redirect every search to Wikimedia.[^commons-technical] This is another reason to pre-index and cache approved assets.

### 5. Failure behavior

Failures must be quiet and deterministic:

- no approved media: return the existing concise text explanation;
- timeout, `429`, `5xx`, missing file or hash mismatch: return text, record an operational event and enqueue revalidation;
- invalid or changed rights metadata: disable media and require review;
- never broaden to an unapproved live search because an approved source failed.

## Licensing conclusion

Remote delivery changes where bytes are stored, not who is reusing them. Commons' official reuse guidance says hotlinking still requires attribution and all other license conditions, and that ignoring them can infringe copyright.[^commons-technical] Openverse likewise assigns independent license verification to the API consumer.[^openverse-terms]

For CC BY/CC BY-SA media, at minimum preserve the creator, source/landing page, exact license/version and URL, and indicate modifications. For CC BY-SA adaptations, comply with ShareAlike for the adapted media. Also review personality/privacy/model-release concerns for identifiable people; an open copyright license is not automatically a commercial model release.[^commons-reuse]

## Recommended next implementation slice

Implement a remote-capable approved-media record and first-use Telegram cache for the existing three Commons entries before building discovery automation. That proves the architecture without weakening the approval gate:

1. add pinned remote URL, provider revision/SHA-1 and optional Telegram `file_id` fields;
2. make local file optional when a fully approved remote record exists;
3. fetch, validate, SHA-256 and upload on cache miss;
4. persist/reuse `file_id`;
5. keep current local-file support and text fallback;
6. then add a separate admin discovery command that creates disabled candidates only.

This gives immediate storage relief and a safe path to grow coverage gradually. It does not promise that all 1,000 exercises have a trustworthy open animation.

## Sources

[^mediawiki-search]: MediaWiki, [API:Search](https://www.mediawiki.org/wiki/API:Search).
[^cirrus-file-search]: MediaWiki, [CirrusSearch file-property filters](https://www.mediawiki.org/wiki/Help:CirrusSearch#File_properties_search).
[^mediawiki-imageinfo]: MediaWiki, [API:Imageinfo](https://www.mediawiki.org/wiki/API:Imageinfo).
[^mediawiki-etiquette]: MediaWiki, [API etiquette](https://www.mediawiki.org/wiki/API:Etiquette).
[^wikimedia-rate-limits]: Wikimedia, [API rate limits](https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits) and [User-Agent policy](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy).
[^commons-reuse]: Wikimedia Commons, [Reusing content outside Wikimedia](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia/en).
[^commons-technical]: Wikimedia Commons, [Technical reuse, downloading and hotlinking](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia/technical).
[^openverse-api]: Openverse, [API consumer documentation](https://api.openverse.org/v1/).
[^openverse-terms]: Openverse, [Terms of Service](https://docs.openverse.org/terms_of_service.html).
[^wger-api]: wger, [Using the API](https://wger.readthedocs.io/en/latest/api/api.html).
[^wger-license]: wger, [official documentation: Licence](https://wger.readthedocs.io/en/latest/#licence).
[^telegram-api]: Telegram, [Bot API: Sending Files and sendAnimation](https://core.telegram.org/bots/api#sendanimation).
